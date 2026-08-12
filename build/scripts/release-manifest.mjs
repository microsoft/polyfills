import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const schemaVersion = 1;
const commitPattern = /^[0-9a-f]{40}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const sourceBranchPattern = /^refs\/heads\/[^\s]+$/;
const outputPrefixPattern = /^[a-z][A-Za-z0-9]*$/;
const npmFileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/;

function requireExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(
      `${label} must contain exactly: ${sortedExpectedKeys.join(", ")}.`,
    );
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function validateNpmAssetFileName(fileName) {
  if (!npmFileNamePattern.test(fileName ?? "")) {
    throw new Error(`Unsafe npm asset fileName: ${String(fileName)}.`);
  }
  return fileName;
}

function validatePackageStructure(pkg, index) {
  const label = `Release manifest package at index ${index}`;
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    throw new Error(`${label} must be an object.`);
  }
  requireExactKeys(
    pkg,
    ["name", "version", "tag", "outputPrefix", "npmAsset"],
    label,
  );
  for (const field of ["name", "version", "tag", "outputPrefix"]) {
    if (typeof pkg[field] !== "string" || pkg[field].length === 0) {
      throw new Error(`${label} has an invalid ${field}.`);
    }
  }
  if (!outputPrefixPattern.test(pkg.outputPrefix)) {
    throw new Error(`${label} has an invalid outputPrefix.`);
  }
  if (
    !pkg.npmAsset ||
    typeof pkg.npmAsset !== "object" ||
    Array.isArray(pkg.npmAsset)
  ) {
    throw new Error(`${label} has an invalid npmAsset.`);
  }
  requireExactKeys(
    pkg.npmAsset,
    ["fileName", "sha256"],
    `${label} npmAsset`,
  );
  try {
    validateNpmAssetFileName(pkg.npmAsset.fileName);
  } catch {
    throw new Error(`${label} has an unsafe npm asset fileName.`);
  }
  if (!hashPattern.test(pkg.npmAsset.sha256 ?? "")) {
    throw new Error(`${label} has an invalid npm asset SHA-256.`);
  }
}

function validateReleaseManifestStructure(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Release manifest must be an object.");
  }
  requireExactKeys(
    manifest,
    [
      "schemaVersion",
      "sourceCommit",
      "sourceBranch",
      "validationMode",
      "packages",
    ],
    "Release manifest",
  );
  if (manifest.schemaVersion !== schemaVersion) {
    throw new Error(
      `Release manifest has an unsupported schema version (got ${String(manifest.schemaVersion)}, expected ${schemaVersion}).`,
    );
  }
  if (!commitPattern.test(manifest.sourceCommit ?? "")) {
    throw new Error("Release manifest has an invalid sourceCommit.");
  }
  if (
    typeof manifest.sourceBranch !== "string" ||
    !sourceBranchPattern.test(manifest.sourceBranch)
  ) {
    throw new Error("Release manifest has an invalid sourceBranch.");
  }
  if (typeof manifest.validationMode !== "boolean") {
    throw new Error("Release manifest has an invalid validationMode.");
  }
  if (!Array.isArray(manifest.packages)) {
    throw new Error("Release manifest packages must be an array.");
  }

  const names = new Set();
  const tags = new Set();
  const prefixes = new Set();
  const fileNames = new Set();
  for (const [index, pkg] of manifest.packages.entries()) {
    validatePackageStructure(pkg, index);
    if (
      names.has(pkg.name) ||
      tags.has(pkg.tag) ||
      prefixes.has(pkg.outputPrefix) ||
      fileNames.has(pkg.npmAsset.fileName)
    ) {
      throw new Error(
        "Release manifest contains duplicate package names, tags, output prefixes, or npm asset file names.",
      );
    }
    names.add(pkg.name);
    tags.add(pkg.tag);
    prefixes.add(pkg.outputPrefix);
    fileNames.add(pkg.npmAsset.fileName);
  }
  return manifest;
}

function createReleaseManifest({
  packages,
  sourceBranch,
  sourceCommit,
  validationMode,
}) {
  return validateReleaseManifestStructure({
    packages,
    schemaVersion,
    sourceBranch,
    sourceCommit,
    validationMode,
  });
}

function validateReleaseManifestPackages(manifest, workspaces) {
  validateReleaseManifestStructure(manifest);
  if (manifest.packages.length === 0) {
    throw new Error("Release manifest contains no packages.");
  }
  const workspaceByName = new Map(
    workspaces.map(workspace => [workspace.name, workspace]),
  );
  for (const pkg of manifest.packages) {
    const workspace = workspaceByName.get(pkg.name);
    if (!workspace) {
      throw new Error(`Release manifest references unknown package ${pkg.name}.`);
    }
    for (const field of ["version", "tag", "outputPrefix"]) {
      if (pkg[field] !== workspace[field]) {
        throw new Error(
          `Release manifest ${field} for ${workspace.name} does not match the workspace.`,
        );
      }
    }
  }
  return manifest;
}

function validateReleaseManifest(
  manifest,
  {
    artifactHashes,
    expectedSourceBranch,
    expectedSourceCommit,
    expectedValidationMode,
    workspaces,
  },
) {
  validateReleaseManifestPackages(manifest, workspaces);
  if (manifest.sourceCommit !== expectedSourceCommit) {
    throw new Error(
      `Manifest sourceCommit ${manifest.sourceCommit} does not match build resource commit ${expectedSourceCommit}.`,
    );
  }
  if (manifest.sourceBranch !== expectedSourceBranch) {
    throw new Error(
      `Manifest sourceBranch ${manifest.sourceBranch} does not match build resource branch ${expectedSourceBranch}.`,
    );
  }
  if (manifest.validationMode !== expectedValidationMode) {
    throw new Error("Release manifest does not match the requested validation mode.");
  }
  if (!manifest.validationMode && manifest.sourceBranch !== "refs/heads/main") {
    throw new Error(
      `Production release artifacts must come from refs/heads/main, not ${manifest.sourceBranch}.`,
    );
  }
  const expectedFiles = new Set();
  for (const pkg of manifest.packages) {
    const { fileName, sha256 } = pkg.npmAsset;
    const actualHash = artifactHashes.get(fileName);
    if (!actualHash) {
      throw new Error(`Release asset ${fileName} is missing.`);
    }
    if (actualHash !== sha256) {
      throw new Error(`Release asset ${fileName} failed SHA-256 validation.`);
    }
    expectedFiles.add(fileName);
  }

  const unexpectedFiles = [...artifactHashes.keys()].filter(
    fileName => !expectedFiles.has(fileName),
  );
  if (unexpectedFiles.length > 0) {
    throw new Error(`Unexpected release assets: ${unexpectedFiles.join(", ")}`);
  }
  return manifest;
}

export {
  createReleaseManifest,
  schemaVersion,
  sha256File,
  validateNpmAssetFileName,
  validateReleaseManifest,
  validateReleaseManifestPackages,
  validateReleaseManifestStructure,
};
