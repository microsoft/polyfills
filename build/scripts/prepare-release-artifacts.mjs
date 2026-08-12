#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
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

function parseSelectedReleaseTags(value) {
  if (typeof value !== "string" || value === "") {
    throw new Error(
      "SELECTED_RELEASE_TAGS is required when packing release artifacts and must be a non-empty string.",
    );
  }

  const tags = value.split(",");
  const invalidIndexes = [];
  for (const [index, tag] of tags.entries()) {
    if (tag.length === 0 || tag !== tag.trim()) {
      invalidIndexes.push(index);
    }
  }
  if (invalidIndexes.length > 0) {
    throw new Error(
      "Invalid SELECTED_RELEASE_TAGS: empty tags or surrounding whitespace " +
        `at indexes: ${invalidIndexes.join(", ")}.`,
    );
  }
  return tags;
}

function formatSelectedReleaseTags(releases) {
  const tags = releases.map(release => release.tag);
  const commaTag = tags.find(tag => tag.includes(","));
  if (commaTag !== undefined) {
    throw new Error(`Release tags cannot contain commas: ${commaTag}.`);
  }
  return tags.join(",");
}

function selectReleases(workspaces, existingTags, includeExisting) {
  return workspaces.filter(
    workspace => includeExisting || !existingTags.has(workspace.tag),
  );
}

function selectRequestedReleases(workspaces, requestedTags) {
  const malformedTags = requestedTags.filter(
    tag =>
      !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*_v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
        tag,
      ),
  );
  if (malformedTags.length > 0) {
    throw new Error(
      `Invalid SELECTED_RELEASE_TAGS: malformed release tags: ${malformedTags.join(", ")}`,
    );
  }

  const duplicateTags = requestedTags.filter(
    (tag, index) => requestedTags.indexOf(tag) !== index,
  );
  if (duplicateTags.length > 0) {
    throw new Error(
      `Invalid SELECTED_RELEASE_TAGS: duplicate selected tags: ${[
        ...new Set(duplicateTags),
      ].join(", ")}`,
    );
  }

  const commaTag = workspaces.find(workspace => workspace.tag.includes(","))?.tag;
  if (commaTag !== undefined) {
    throw new Error(`Release tags cannot contain commas: ${commaTag}.`);
  }

  const workspaceByTag = new Map(
    workspaces.map(workspace => [workspace.tag, workspace]),
  );
  const releases = requestedTags.map(tag => workspaceByTag.get(tag));
  const unknownTags = requestedTags.filter((_, index) => !releases[index]);
  if (unknownTags.length > 0) {
    throw new Error(
      `Invalid SELECTED_RELEASE_TAGS: unknown or non-publishable tags: ${unknownTags.join(", ")}`,
    );
  }
  return releases;
}

function gitResult(args) {
  return spawnSync(command("git"), args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitFailure(action, result) {
  const detail = (result.stderr || result.stdout || result.error?.message || "")
    .trim()
    .replaceAll("\n", " ");
  return new Error(`Unable to ${action}${detail ? `: ${detail}` : "."}`);
}

function createOriginTagChecker(execute = gitResult) {
  return {
    fetch() {
      const result = execute([
        "fetch",
        "--force",
        "--tags",
        "--no-recurse-submodules",
        "origin",
      ]);
      if (result.status !== 0) {
        throw gitFailure("fetch release tags from origin", result);
      }
    },
    exists(tag) {
      const result = execute([
        "ls-remote",
        "--exit-code",
        "--refs",
        "--tags",
        "origin",
        `refs/tags/${tag}`,
      ]);
      if (result.status === 0) return true;
      if (result.status === 2) return false;
      throw gitFailure(`check release tag ${tag} on origin`, result);
    },
  };
}

function recheckSelectedReleaseTags(
  releases,
  validationMode,
  originTags = createOriginTagChecker(),
) {
  originTags.fetch();
  const conflictingTags = releases
    .filter(release => originTags.exists(release.tag))
    .map(release => release.tag);
  if (!validationMode && conflictingTags.length > 0) {
    throw new Error(
      "Concurrent release detected: selected release tags appeared on origin " +
        `after selection: ${conflictingTags.join(", ")}. ` +
        "Refusing to shrink or alter the selected release batch.",
    );
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
  const releases = checkOnly
    ? selectReleases(workspaces, listGitTags(), validationMode)
    : selectRequestedReleases(
        workspaces,
        parseSelectedReleaseTags(process.env.SELECTED_RELEASE_TAGS),
      );

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
    formatSelectedReleaseTags(releases),
  );
  updateBuildNumberAfterSelection(releases.length, checkOnly);

  if (checkOnly || releases.length === 0) {
    return;
  }

  recheckSelectedReleaseTags(releases, validationMode);

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
  createOriginTagChecker,
  formatSelectedReleaseTags,
  parseSelectedReleaseTags,
  parsePackOutput,
  recheckSelectedReleaseTags,
  selectReleases,
  selectRequestedReleases,
  updateBuildNumberAfterSelection,
};
