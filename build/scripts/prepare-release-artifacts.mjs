#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { updateAzureBuildNumber } from "./azure-build-number.mjs";
import {
  createReleaseManifest,
  sha256File,
  validateNpmAssetFileName,
} from "./release-manifest.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";
import {
  assertSelectedReleaseTagsNotOnOrigin,
  formatSelectedReleaseTags,
  parseSelectedReleaseTags,
  resolveSelectedReleases,
} from "./selected-release-tags.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactDir = join(repoRoot, "publish_artifacts_npm");
const metadataDir = join(repoRoot, "publish_artifacts_meta");

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

function selectReleases(workspaces, existingTags, includeExisting) {
  return workspaces.filter(
    workspace => includeExisting || !existingTags.has(workspace.tag),
  );
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

function parsePackOutput(output) {
  const packages = JSON.parse(output);
  if (!Array.isArray(packages) || packages.length === 0 || !packages[0].filename) {
    throw new Error(`Unexpected npm pack output: ${output}`);
  }
  return packages[0].filename;
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

function packSelectedReleases({
  artifactDir,
  log = console.log,
  logError = console.error,
  metadataPath,
  packRelease,
  releases,
  sourceBranch,
  sourceCommit,
  validationMode,
  hashFile = sha256File,
  writeManifest = (path, manifest) =>
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`),
}) {
  const packages = [];
  const failures = [];
  for (const release of releases) {
    log(`Packing ${release.name}@${release.version}...`);
    try {
      const fileName = validateNpmAssetFileName(packRelease(release));
      packages.push({
        name: release.name,
        npmAsset: {
          fileName,
          sha256: hashFile(join(artifactDir, fileName)),
        },
        outputPrefix: release.outputPrefix,
        tag: release.tag,
        version: release.version,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ error, release });
      logError(`Failed to pack ${release.name}@${release.version}: ${message}`);
    }
  }

  const manifest = createReleaseManifest({
    packages,
    sourceBranch,
    sourceCommit,
    validationMode,
  });
  writeManifest(metadataPath, manifest);
  log(`Prepared diagnostic release manifest for ${packages.length} package(s).`);
  return { failures, manifest };
}

function main() {
  const checkOnly = process.argv.includes("--check-only");
  const validationMode = process.env.VALIDATION_MODE === "true";
  const workspaces = listPublishableWorkspaces(repoRoot);
  const originTags = createOriginTagChecker();
  const releases = checkOnly
    ? selectReleases(
        workspaces,
        new Set(
          workspaces
            .filter(workspace => originTags.exists(workspace.tag))
            .map(workspace => workspace.tag),
        ),
        validationMode,
      )
    : resolveSelectedReleases(
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
    "selectedReleaseTags",
    formatSelectedReleaseTags(releases),
  );
  updateBuildNumberAfterSelection(releases.length, checkOnly);

  if (checkOnly || releases.length === 0) {
    return;
  }

  assertSelectedReleaseTagsNotOnOrigin(releases, validationMode, originTags);

  const sourceCommit = (
    process.env.BUILD_SOURCEVERSION || run("git", ["rev-parse", "HEAD"])
  ).trim();
  const sourceBranch = (
    process.env.BUILD_SOURCEBRANCH ||
    run("git", ["rev-parse", "--symbolic-full-name", "HEAD"])
  ).trim();

  rmSync(artifactDir, { force: true, recursive: true });
  rmSync(metadataDir, { force: true, recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(metadataDir, { recursive: true });

  const { failures } = packSelectedReleases({
    artifactDir,
    metadataPath: join(metadataDir, "release-manifest.json"),
    packRelease(release) {
      return parsePackOutput(
        run(
          "npm",
          [
            "pack",
            "--silent",
            "--json",
            `--workspace=${release.name}`,
            `--pack-destination=${artifactDir}`,
          ],
          { stdio: ["ignore", "pipe", "inherit"] },
        ),
      );
    },
    releases,
    sourceBranch,
    sourceCommit,
    validationMode,
  });
  if (failures.length > 0) {
    throw new Error(
      `Failed to pack ${failures.length} of ${releases.length} selected package(s).`,
    );
  }
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
  packSelectedReleases,
  parsePackOutput,
  selectReleases,
  updateBuildNumberAfterSelection,
};
