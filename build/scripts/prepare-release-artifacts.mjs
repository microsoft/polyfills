#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { updateAzureBuildNumber } from "./azure-build-number.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactDir = join(repoRoot, "publish_artifacts");
const metadataDir = join(repoRoot, "release_metadata");

function command(name) {
  return process.platform === "win32" && name === "npm" ? "npm.cmd" : name;
}

function run(file, args, options = {}) {
  return execFileSync(command(file), args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function listGitTags() {
  return new Set(
    run("git", ["tag", "--list"])
      .split("\n")
      .map(tag => tag.trim())
      .filter(Boolean),
  );
}

function selectReleases(workspaces, existingTags, includeExisting) {
  return workspaces.filter(
    workspace => includeExisting || !existingTags.has(workspace.tag),
  );
}

function selectRequestedReleases(workspaces, requestedTags) {
  const workspaceByTag = new Map(
    workspaces.map(workspace => [workspace.tag, workspace]),
  );
  const releases = requestedTags.map(tag => workspaceByTag.get(tag));
  const unknownTags = requestedTags.filter((_, index) => !releases[index]);
  if (unknownTags.length > 0) {
    throw new Error(`Unknown requested release tags: ${unknownTags.join(", ")}`);
  }
  return releases;
}

function parsePackOutput(output) {
  const packages = JSON.parse(output);
  if (!Array.isArray(packages) || packages.length === 0 || !packages[0].filename) {
    throw new Error(`Unexpected npm pack output: ${output}`);
  }
  return packages[0].filename;
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function setAzureOutput(name, value) {
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
  }
}

function updateBuildNumberAfterSelection(
  packageCount,
  checkOnly,
  updateBuildNumber = updateAzureBuildNumber,
) {
  if (checkOnly) {
    updateBuildNumber(packageCount, "build");
  }
}

function main() {
  const checkOnly = process.argv.includes("--check-only");
  const validationMode = process.env.VALIDATION_MODE === "true";
  const workspaces = listPublishableWorkspaces(repoRoot);
  const requestedTags = (process.env.SELECTED_RELEASE_TAGS ?? "")
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
  const releases =
    requestedTags.length > 0
      ? selectRequestedReleases(workspaces, requestedTags)
      : selectReleases(workspaces, listGitTags(), validationMode);

  console.log(`Publishable workspaces: ${workspaces.length}`);
  console.log(`Packages selected for the manifest: ${releases.length}`);
  if (validationMode) {
    console.log("Validation mode: packaging existing releases is enabled.");
  }
  for (const { name, version, tag } of releases) {
    console.log(`  - ${name}@${version} (${tag})`);
  }

  setAzureOutput("shouldBuild", releases.length > 0 ? "true" : "false");
  setAzureOutput("packageCount", String(releases.length));
  setAzureOutput(
    "releaseTags",
    releases.map(release => release.tag).join(","),
  );
  updateBuildNumberAfterSelection(releases.length, checkOnly);

  if (checkOnly || releases.length === 0) {
    return;
  }

  const releaseCommit = (
    process.env.BUILD_SOURCEVERSION || run("git", ["rev-parse", "HEAD"])
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(releaseCommit)) {
    throw new Error(`Invalid release commit: ${releaseCommit}`);
  }

  rmSync(artifactDir, { force: true, recursive: true });
  rmSync(metadataDir, { force: true, recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  const manifestPackages = [];
  for (const release of releases) {
    console.log(`Packing ${release.name}@${release.version}...`);
    const packOutput = run(
      "npm",
      [
        "pack",
        "--silent",
        "--json",
        `--workspace=${release.name}`,
        `--pack-destination=${artifactDir}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const asset = parsePackOutput(packOutput);
    const assetPath = join(artifactDir, asset);

    manifestPackages.push({
      asset,
      name: release.name,
      sha256: sha256(assetPath),
      tag: release.tag,
      version: release.version,
    });
  }

  const manifest = {
    releaseCommit,
    packages: manifestPackages,
    schemaVersion: 1,
    validationMode,
  };
  writeFileSync(
    join(metadataDir, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Prepared release manifest for ${manifestPackages.length} package(s).`);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  parsePackOutput,
  selectReleases,
  selectRequestedReleases,
  updateBuildNumberAfterSelection,
};
