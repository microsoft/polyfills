#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateReleaseManifestPackages } from "./release-manifest.mjs";
import { reportReleaseScriptError } from "./release-script-error.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultRepository = "microsoft/polyfills";
const apiTimeoutMs = 10000;

function selectedReleaseChecks(manifest, workspaces) {
  validateReleaseManifestPackages(manifest, workspaces);

  return manifest.packages.map(pkg => {
    return {
      assetFileNames: [pkg.npmAsset.fileName],
      name: pkg.name,
      outputName: `${pkg.outputPrefix}GitHubReleaseExists`,
      tag: pkg.tag,
    };
  });
}

async function githubReleaseExists(
  tag,
  expectedAssetFileNames,
  {
    fetchImpl = globalThis.fetch,
    repository = defaultRepository,
    timeoutMs = apiTimeoutMs,
  } = {},
) {
  if (
    !Array.isArray(expectedAssetFileNames) ||
    expectedAssetFileNames.length === 0 ||
    expectedAssetFileNames.some(name => typeof name !== "string" || !name)
  ) {
    throw new Error("Expected GitHub Release asset filenames are required.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "polyfills-cd-pipeline",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
      {
        headers,
        method: "GET",
        signal: controller.signal,
      },
    );

    if (response.status === 200) {
      let release;
      try {
        release = await response.json();
      } catch {
        throw new Error("response was not valid JSON");
      }
      if (
        release === null ||
        typeof release !== "object" ||
        Array.isArray(release) ||
        !Array.isArray(release.assets) ||
        release.assets.some(
          asset =>
            asset === null ||
            typeof asset !== "object" ||
            Array.isArray(asset) ||
            typeof asset.name !== "string",
        )
      ) {
        throw new Error("response was not a GitHub Release with assets");
      }

      const actualAssets = new Set(release.assets.map(asset => asset.name));
      const missingAssets = expectedAssetFileNames.filter(
        fileName => !actualAssets.has(fileName),
      );
      if (missingAssets.length > 0) {
        throw new Error(
          `GitHub Release is incomplete; missing expected assets: ${missingAssets.join(", ")}`,
        );
      }
      return true;
    }
    if (response.status === 404) {
      return false;
    }

    const detail = await response.text().catch(() => "");
    throw new Error(
      `GitHub API returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  } catch (error) {
    throw new Error(
      `Failed to query GitHub Release for ${tag}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function setAzureOutput(name, value) {
  console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
}

async function checkGitHubReleases(
  manifest,
  {
    workspaces,
    releaseExists = githubReleaseExists,
    emitOutput = setAzureOutput,
    log = console.log,
  },
) {
  const results = [];
  for (const release of selectedReleaseChecks(manifest, workspaces)) {
    const exists = await releaseExists(release.tag, release.assetFileNames);
    emitOutput(release.outputName, exists ? "true" : "false");
    log(
      `${release.name}: ${release.tag} ${exists ? "already has a complete GitHub Release" : "does not have a GitHub Release"}.`,
    );
    results.push({ ...release, exists });
  }
  return results;
}

async function main() {
  const manifestPath = process.env.RELEASE_MANIFEST_PATH ?? process.argv[2];
  if (!manifestPath) {
    throw new Error(
      "RELEASE_MANIFEST_PATH or a release manifest path argument is required.",
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  await checkGitHubReleases(manifest, {
    workspaces: listPublishableWorkspaces(repoRoot),
  });
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch(error => {
    reportReleaseScriptError(error);
    process.exit(1);
  });
}

export {
  checkGitHubReleases,
  githubReleaseExists,
  selectedReleaseChecks,
};
