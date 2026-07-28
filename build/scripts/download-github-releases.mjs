#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkOnly = process.argv.includes("--check-only");
const deployedPrefix = "deployed/";

// Legacy bare-tag shim configuration.
//
// Unlike FAST, polyfills already has historical package-version tags that were
// pushed before this tokenless CD flow existed and therefore have no GitHub
// Release (notably `@microsoft/focusgroup-polyfill_v1.5.0`). Azure's
// `DownloadGitHubRelease@0` task would fail if it tried to download a release
// that does not exist, so the Check stage queries GitHub's "release by tag" API
// to distinguish real releases from these bare/legacy tags. Transient GitHub
// failures must not be misread as "no release" (that would drop a real
// deployment) nor as "release exists" (that would queue a download that fails),
// so transient responses are retried with bounded backoff and, if still
// unresolved, surfaced as an error that fails the idempotent Check stage safely.
const releaseLookupRetries = 3;
const releaseLookupBackoffMs = 500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", ...options });
}

function expandWorkspacePattern(pattern) {
  const segments = pattern.split(/[\\/]+/).filter(Boolean);
  let paths = ["."];

  for (const segment of segments) {
    const nextPaths = [];
    const hasWildcard = segment.includes("*");
    const matcher = hasWildcard
      ? new RegExp(`^${segment.replace(/\*/g, ".*")}$`)
      : null;

    for (const currentPath of paths) {
      if (!existsSync(currentPath)) {
        continue;
      }

      if (!hasWildcard) {
        nextPaths.push(join(currentPath, segment));
        continue;
      }

      for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
        if (entry.isDirectory() && matcher.test(entry.name)) {
          nextPaths.push(join(currentPath, entry.name));
        }
      }
    }

    paths = nextPaths;
  }

  return paths;
}

function listGitTags() {
  return run("git", ["tag", "--list"])
    .split("\n")
    .map(tag => tag.trim())
    .filter(Boolean);
}

function npmNameToOutputPrefix(npmName) {
  return npmName
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/^microsoft-/, "")
    .replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function listPublishableWorkspaces() {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : (rootPackage.workspaces?.packages ?? []);
  const locations = new Set(patterns.flatMap(expandWorkspacePattern));

  return Array.from(locations)
    .map(location => {
      const packagePath = join(location, "package.json");
      if (!existsSync(packagePath)) {
        return null;
      }

      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      if (packageJson.private === true || !packageJson.name || !packageJson.version) {
        return null;
      }

      return {
        name: packageJson.name,
        outputPrefix: npmNameToOutputPrefix(packageJson.name),
        tag: `${packageJson.name}_v${packageJson.version}`,
        version: packageJson.version,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function setAzureOutput(name, value) {
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
  }
}

async function githubReleaseExists(repo, tag, options = {}) {
  const {
    fetchImpl = fetch,
    sleepImpl = sleep,
    retries = releaseLookupRetries,
    backoffMs = releaseLookupBackoffMs,
    token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim(),
  } = options;

  const url = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(
    tag,
  )}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "polyfills-release-check",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleepImpl(backoffMs * attempt);
    }

    let response;
    try {
      response = await fetchImpl(url, { headers });
    } catch (error) {
      // Network-level failures are transient; retry then fail safe.
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }

    // A missing release is a definitive answer (legacy/bare tag): stop retrying.
    if (response.status === 404) {
      return false;
    }

    // Rate limiting and 5xx are transient; retry with backoff.
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(
        `GitHub release lookup for ${tag} failed: ${response.status}`,
      );
      continue;
    }

    if (!response.ok) {
      // Other 4xx (e.g. 401/403) will not change on retry: fail safe.
      throw new Error(`GitHub release lookup for ${tag} failed: ${response.status}`);
    }

    // A 2xx must describe the release we asked for. A malformed or mismatched
    // body is treated as an error rather than optimistically assuming a release
    // exists, so the Check stage fails safely instead of queuing a bad download.
    let body;
    try {
      body = await response.json();
    } catch (error) {
      throw new Error(
        `GitHub release lookup for ${tag} returned a malformed response: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!body || typeof body.tag_name !== "string" || body.tag_name !== tag) {
      throw new Error(
        `GitHub release lookup for ${tag} returned an unexpected payload (tag_name: ${
          body ? JSON.stringify(body.tag_name) : "none"
        }).`,
      );
    }

    return true;
  }

  throw new Error(
    `GitHub release lookup for ${tag} failed after ${retries + 1} attempt(s): ${
      lastError ? lastError.message : "unknown error"
    }`,
  );
}

async function main() {
  if (!checkOnly) {
    console.error(
      "download-github-releases.mjs only supports --check-only; Azure Pipelines downloads assets with DownloadGitHubRelease@0.",
    );
    process.exit(1);
  }

  const repo = process.env.GITHUB_REPOSITORY || "microsoft/polyfills";
  const allTags = listGitTags();
  const tagSet = new Set(allTags);
  const deployed = new Set(
    allTags
      .filter(tag => tag.startsWith(deployedPrefix))
      .map(tag => tag.slice(deployedPrefix.length)),
  );
  const publishableWorkspaces = listPublishableWorkspaces();
  const releaseCandidates = [];
  const bareTags = [];

  for (const workspace of publishableWorkspaces) {
    if (!tagSet.has(workspace.tag) || deployed.has(workspace.tag)) {
      continue;
    }

    if (await githubReleaseExists(repo, workspace.tag)) {
      releaseCandidates.push(workspace);
    } else {
      bareTags.push(workspace);
    }
  }

  const undeployedTags = releaseCandidates.map(({ tag }) => tag);
  const undeployedTagSet = new Set(undeployedTags);

  console.log(`Publishable workspaces:       ${publishableWorkspaces.length}`);
  console.log(`Undeployed GitHub releases:   ${releaseCandidates.length}`);
  console.log(`Bare tags without a release:  ${bareTags.length}`);

  if (releaseCandidates.length > 0) {
    console.log("\nUndeployed releases:");
    for (const { name, tag, version } of releaseCandidates) {
      console.log(`  - ${name}@${version} (${tag})`);
    }
  }

  if (bareTags.length > 0) {
    console.log("\nSkipping tags without a GitHub release:");
    for (const { name, tag, version } of bareTags) {
      console.log(`  - ${name}@${version} (${tag})`);
    }
  }

  setAzureOutput("needsDeployment", releaseCandidates.length > 0 ? "true" : "false");
  setAzureOutput("undeployedTags", undeployedTags.join(","));

  for (const workspace of publishableWorkspaces) {
    setAzureOutput(`${workspace.outputPrefix}ReleaseTag`, workspace.tag);
    setAzureOutput(
      `${workspace.outputPrefix}NeedsDeployment`,
      undeployedTagSet.has(workspace.tag) ? "true" : "false",
    );
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { githubReleaseExists, listPublishableWorkspaces, npmNameToOutputPrefix };
