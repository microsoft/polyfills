#!/usr/bin/env node

import {
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { updateAzureBuildNumber } from "./azure-build-number.mjs";
import {
  sha256File,
  validateReleaseManifest,
} from "./release-manifest.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function setAzureOutput(name, value) {
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
  }
}

function main() {
  const manifestPath = process.env.RELEASE_MANIFEST_PATH;
  const artifactDir = process.env.RELEASE_ARTIFACT_DIR;
  const expectedSourceCommit = process.env.EXPECTED_SOURCE_COMMIT?.trim();
  const expectedSourceBranch = process.env.EXPECTED_SOURCE_BRANCH?.trim();
  const expectedValidationMode = process.env.EXPECTED_VALIDATION_MODE === "true";

  if (
    !manifestPath ||
    !artifactDir ||
    !expectedSourceCommit ||
    !expectedSourceBranch
  ) {
    throw new Error(
      "RELEASE_MANIFEST_PATH, RELEASE_ARTIFACT_DIR, EXPECTED_SOURCE_COMMIT, and EXPECTED_SOURCE_BRANCH are required.",
    );
  }

  const artifactHashes = new Map();
  for (const asset of readdirSync(artifactDir)) {
    const assetPath = join(artifactDir, asset);
    if (!lstatSync(assetPath).isFile()) {
      throw new Error(`Unexpected non-file release artifact: ${asset}`);
    }
    artifactHashes.set(asset, sha256File(assetPath));
  }

  const workspaces = listPublishableWorkspaces(repoRoot);
  const manifest = validateReleaseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    {
      artifactHashes,
      expectedSourceBranch,
      expectedSourceCommit,
      expectedValidationMode,
      workspaces,
    },
  );
  setAzureOutput("releaseCommit", manifest.sourceCommit);
  setAzureOutput(
    "releaseTags",
    manifest.packages.map(pkg => pkg.tag).join(","),
  );
  setAzureOutput("packageCount", String(manifest.packages.length));

  for (const pkg of manifest.packages) {
    setAzureOutput(`${pkg.outputPrefix}Included`, "true");
    setAzureOutput(`${pkg.outputPrefix}ReleaseTag`, pkg.tag);
    setAzureOutput(
      `${pkg.outputPrefix}ReleaseAsset`,
      pkg.npmAsset.fileName,
    );
  }

  updateAzureBuildNumber(manifest.packages.length, "cd");
  console.log(`Validated release manifest for ${manifest.packages.length} package(s).`);
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
