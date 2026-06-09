#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const checkOnly = process.argv.includes("--check-only");
const deployedPrefix = "deployed/";

if (!checkOnly) {
  console.error(
    "download-github-releases.mjs only supports --check-only; Azure Pipelines downloads assets with DownloadGitHubRelease@0.",
  );
  process.exit(1);
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

async function githubReleaseExists(repo, tag) {
  const url = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(
    tag,
  )}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "polyfills-release-check",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }

  const response = await fetch(url, { headers });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`GitHub release lookup for ${tag} failed: ${response.status}`);
  }
  return true;
}

async function main() {
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

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
