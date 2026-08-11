#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { updateAzureBuildNumber } from "./azure-build-number.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateReleaseManifest(
  manifest,
  {
    artifactHashes,
    expectedCommit,
    expectedValidationMode,
    workspaces,
  },
) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error(
      `Release manifest has an unsupported schema version (got ${String(manifest?.schemaVersion)}, expected 1).`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.releaseCommit ?? "")) {
    throw new Error("Release manifest has an invalid release commit.");
  }
  if (manifest.releaseCommit !== expectedCommit) {
    throw new Error(
      `Release commit in manifest ${manifest.releaseCommit} does not match build resource commit ${expectedCommit}.`,
    );
  }
  if (manifest.validationMode !== expectedValidationMode) {
    throw new Error("Release manifest does not match the requested validation mode.");
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    throw new Error("Release manifest contains no packages.");
  }

  const workspaceByName = new Map(workspaces.map(workspace => [workspace.name, workspace]));
  const names = new Set();
  const tags = new Set();
  const assets = new Set();

  for (const pkg of manifest.packages) {
    const workspace = workspaceByName.get(pkg?.name);
    if (!workspace) {
      throw new Error(`Release manifest references unknown package ${pkg?.name}.`);
    }
    if (pkg.version !== workspace.version || pkg.tag !== workspace.tag) {
      throw new Error(
        `Release manifest for ${workspace.name} does not match package.json.`,
      );
    }
    if (
      typeof pkg.asset !== "string" ||
      pkg.asset.length === 0 ||
      pkg.asset.includes("/") ||
      pkg.asset.includes("\\") ||
      !pkg.asset.endsWith(".tgz")
    ) {
      throw new Error(`Release manifest for ${workspace.name} has an invalid asset.`);
    }
    if (!/^[0-9a-f]{64}$/.test(pkg.sha256 ?? "")) {
      throw new Error(`Release manifest for ${workspace.name} has an invalid SHA-256.`);
    }
    if (names.has(pkg.name) || tags.has(pkg.tag) || assets.has(pkg.asset)) {
      throw new Error("Release manifest contains duplicate packages, tags, or assets.");
    }

    const actualHash = artifactHashes.get(pkg.asset);
    if (!actualHash) {
      throw new Error(`Release asset ${pkg.asset} is missing.`);
    }
    if (actualHash !== pkg.sha256) {
      throw new Error(`Release asset ${pkg.asset} failed SHA-256 validation.`);
    }

    names.add(pkg.name);
    tags.add(pkg.tag);
    assets.add(pkg.asset);
  }

  const unexpectedAssets = [...artifactHashes.keys()].filter(asset => !assets.has(asset));
  if (unexpectedAssets.length > 0) {
    throw new Error(`Unexpected release assets: ${unexpectedAssets.join(", ")}`);
  }

  return manifest;
}

function setAzureOutput(name, value) {
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
  }
}

function main() {
  const manifestPath = process.env.RELEASE_MANIFEST_PATH;
  const artifactDir = process.env.RELEASE_ARTIFACT_DIR;
  const expectedCommit = process.env.EXPECTED_RELEASE_COMMIT?.trim();
  const expectedValidationMode = process.env.EXPECTED_VALIDATION_MODE === "true";

  if (!manifestPath || !artifactDir || !expectedCommit) {
    throw new Error(
      "RELEASE_MANIFEST_PATH, RELEASE_ARTIFACT_DIR, and EXPECTED_RELEASE_COMMIT are required.",
    );
  }

  const artifactHashes = new Map();
  for (const asset of readdirSync(artifactDir)) {
    const assetPath = join(artifactDir, asset);
    if (!lstatSync(assetPath).isFile()) {
      throw new Error(`Unexpected non-file release artifact: ${asset}`);
    }
    artifactHashes.set(asset, sha256(assetPath));
  }

  const workspaces = listPublishableWorkspaces(repoRoot);
  const manifest = validateReleaseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    {
      artifactHashes,
      expectedCommit,
      expectedValidationMode,
      workspaces,
    },
  );
  const packageByName = new Map(
    manifest.packages.map(pkg => [pkg.name, pkg]),
  );

  setAzureOutput("releaseCommit", manifest.releaseCommit);
  setAzureOutput(
    "releaseTags",
    manifest.packages.map(pkg => pkg.tag).join(","),
  );
  setAzureOutput("packageCount", String(manifest.packages.length));

  for (const workspace of workspaces) {
    const pkg = packageByName.get(workspace.name);
    setAzureOutput(`${workspace.outputPrefix}Included`, pkg ? "true" : "false");
    setAzureOutput(
      `${workspace.outputPrefix}ReleaseTag`,
      pkg?.tag ?? workspace.tag,
    );
    setAzureOutput(`${workspace.outputPrefix}ReleaseAsset`, pkg?.asset ?? "");
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

export { validateReleaseManifest };
