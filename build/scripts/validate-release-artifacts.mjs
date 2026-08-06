#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateReleaseMetadata(
  metadata,
  {
    artifactHashes,
    expectedCommit,
    expectedValidationMode,
    workspaces,
  },
) {
  if (metadata?.schemaVersion !== 1) {
    throw new Error(
      `Release metadata has an unsupported schema version (got ${String(metadata?.schemaVersion)}, expected 1).`,
    );
  }
  if (!/^[0-9a-f]{40}$/.test(metadata.releaseCommit ?? "")) {
    throw new Error("Release metadata has an invalid release commit.");
  }
  if (metadata.releaseCommit !== expectedCommit) {
    throw new Error(
      `Release commit ${metadata.releaseCommit} does not match build resource commit ${expectedCommit}.`,
    );
  }
  if (metadata.validationMode !== expectedValidationMode) {
    throw new Error("Release metadata does not match the requested validation mode.");
  }
  if (!Array.isArray(metadata.releases) || metadata.releases.length === 0) {
    throw new Error("Release metadata contains no releases.");
  }

  const workspaceByName = new Map(workspaces.map(workspace => [workspace.name, workspace]));
  const names = new Set();
  const tags = new Set();
  const assets = new Set();

  for (const release of metadata.releases) {
    const workspace = workspaceByName.get(release?.name);
    if (!workspace) {
      throw new Error(`Release metadata references unknown package ${release?.name}.`);
    }
    if (release.version !== workspace.version || release.tag !== workspace.tag) {
      throw new Error(
        `Release metadata for ${workspace.name} does not match package.json.`,
      );
    }
    if (
      typeof release.asset !== "string" ||
      release.asset.length === 0 ||
      release.asset.includes("/") ||
      release.asset.includes("\\") ||
      !release.asset.endsWith(".tgz")
    ) {
      throw new Error(`Release metadata for ${workspace.name} has an invalid asset.`);
    }
    if (!/^[0-9a-f]{64}$/.test(release.sha256 ?? "")) {
      throw new Error(`Release metadata for ${workspace.name} has an invalid SHA-256.`);
    }
    if (names.has(release.name) || tags.has(release.tag) || assets.has(release.asset)) {
      throw new Error("Release metadata contains duplicate packages, tags, or assets.");
    }

    const actualHash = artifactHashes.get(release.asset);
    if (!actualHash) {
      throw new Error(`Release asset ${release.asset} is missing.`);
    }
    if (actualHash !== release.sha256) {
      throw new Error(`Release asset ${release.asset} failed SHA-256 validation.`);
    }

    names.add(release.name);
    tags.add(release.tag);
    assets.add(release.asset);
  }

  const unexpectedAssets = [...artifactHashes.keys()].filter(asset => !assets.has(asset));
  if (unexpectedAssets.length > 0) {
    throw new Error(`Unexpected release assets: ${unexpectedAssets.join(", ")}`);
  }

  return metadata;
}

function setAzureOutput(name, value) {
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
  }
}

function main() {
  const metadataPath = process.env.RELEASE_METADATA_PATH;
  const artifactDir = process.env.RELEASE_ARTIFACT_DIR;
  const expectedCommit = process.env.EXPECTED_RELEASE_COMMIT?.trim();
  const expectedValidationMode = process.env.EXPECTED_VALIDATION_MODE === "true";

  if (!metadataPath || !artifactDir || !expectedCommit) {
    throw new Error(
      "RELEASE_METADATA_PATH, RELEASE_ARTIFACT_DIR, and EXPECTED_RELEASE_COMMIT are required.",
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
  const metadata = validateReleaseMetadata(
    JSON.parse(readFileSync(metadataPath, "utf8")),
    {
      artifactHashes,
      expectedCommit,
      expectedValidationMode,
      workspaces,
    },
  );
  const releaseByName = new Map(
    metadata.releases.map(release => [release.name, release]),
  );

  setAzureOutput("releaseCommit", metadata.releaseCommit);
  setAzureOutput(
    "releaseTags",
    metadata.releases.map(release => release.tag).join(","),
  );

  for (const workspace of workspaces) {
    const release = releaseByName.get(workspace.name);
    setAzureOutput(`${workspace.outputPrefix}Included`, release ? "true" : "false");
    setAzureOutput(
      `${workspace.outputPrefix}ReleaseTag`,
      release?.tag ?? workspace.tag,
    );
    setAzureOutput(`${workspace.outputPrefix}ReleaseAsset`, release?.asset ?? "");
  }

  const buildLabel =
    metadata.releases.length === 1
      ? `${metadata.releases[0].name
          .replace(/^@/, "")
          .replace(/[^a-zA-Z0-9.-]+/g, "-")}-${metadata.releases[0].version}`
      : `polyfills-${metadata.releases.length}-releases`;
  if (process.env.TF_BUILD) {
    console.log(
      `##vso[build.updatebuildnumber]${buildLabel}-cd-${process.env.BUILD_BUILDID}`,
    );
  }
  console.log(`Validated ${metadata.releases.length} release artifact(s).`);
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

export { validateReleaseMetadata };
