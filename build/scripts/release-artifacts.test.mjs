import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAzureBuildNumber } from "./azure-build-number.mjs";
import {
  selectReleases,
  selectRequestedReleases,
  updateBuildNumberAfterSelection,
} from "./prepare-release-artifacts.mjs";
import { validateReleaseManifest } from "./validate-release-artifacts.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const workspace = {
  name: "@microsoft/focusgroup-polyfill",
  outputPrefix: "focusgroupPolyfill",
  tag: "@microsoft/focusgroup-polyfill_v1.6.0",
  version: "1.6.0",
};
const asset = "microsoft-focusgroup-polyfill-1.6.0.tgz";
const hash = "a".repeat(64);

test("formats Azure run numbers from the manifest package count and Build.BuildId", () => {
  assert.equal(formatAzureBuildNumber(0, "build", "123"), "0-build-123");
  assert.equal(formatAzureBuildNumber(2, "build", "456"), "2-build-456");
  assert.equal(formatAzureBuildNumber(2, "cd", "789"), "2-cd-789");
  assert.throws(
    () => formatAzureBuildNumber(-1, "build", "123"),
    /Invalid package count/,
  );
  assert.throws(
    () => formatAzureBuildNumber(1, "cd", "not-an-id"),
    /Invalid Azure Build\.BuildId/,
  );
});

test("full packing does not update or require an Azure build number", () => {
  const previousTfBuild = process.env.TF_BUILD;
  const previousBuildId = process.env.AZURE_BUILD_ID;
  process.env.TF_BUILD = "True";
  delete process.env.AZURE_BUILD_ID;

  try {
    assert.doesNotThrow(() => updateBuildNumberAfterSelection(2, false));
  } finally {
    if (previousTfBuild === undefined) delete process.env.TF_BUILD;
    else process.env.TF_BUILD = previousTfBuild;
    if (previousBuildId === undefined) delete process.env.AZURE_BUILD_ID;
    else process.env.AZURE_BUILD_ID = previousBuildId;
  }
});

test("check-only selection updates and validates the Azure build number", () => {
  const previousTfBuild = process.env.TF_BUILD;
  const previousBuildId = process.env.AZURE_BUILD_ID;
  const previousLog = console.log;
  const updates = [];
  process.env.TF_BUILD = "True";
  process.env.AZURE_BUILD_ID = "123";
  console.log = value => updates.push(value);

  try {
    updateBuildNumberAfterSelection(0, true);
    process.env.AZURE_BUILD_ID = "456";
    updateBuildNumberAfterSelection(2, true);
    assert.deepEqual(updates, [
      "##vso[build.updatebuildnumber]0-build-123",
      "##vso[build.updatebuildnumber]2-build-456",
    ]);

    delete process.env.AZURE_BUILD_ID;
    assert.throws(
      () => updateBuildNumberAfterSelection(1, true),
      /Invalid Azure Build\.BuildId/,
    );
  } finally {
    console.log = previousLog;
    if (previousTfBuild === undefined) delete process.env.TF_BUILD;
    else process.env.TF_BUILD = previousTfBuild;
    if (previousBuildId === undefined) delete process.env.AZURE_BUILD_ID;
    else process.env.AZURE_BUILD_ID = previousBuildId;
  }
});

function metadata(overrides = {}) {
  return {
    releaseCommit: commit,
    packages: [
      {
        asset,
        name: workspace.name,
        sha256: hash,
        tag: workspace.tag,
        version: workspace.version,
      },
    ],
    schemaVersion: 1,
    validationMode: false,
    ...overrides,
  };
}

test("selectReleases skips tags that already exist", () => {
  assert.deepEqual(selectReleases([workspace], new Set([workspace.tag]), false), []);
  assert.deepEqual(selectReleases([workspace], new Set(), false), [workspace]);
});

test("selectReleases includes existing tags in validation mode", () => {
  assert.deepEqual(selectReleases([workspace], new Set([workspace.tag]), true), [
    workspace,
  ]);
});

test("selectRequestedReleases preserves the build-stage selection", () => {
  assert.deepEqual(selectRequestedReleases([workspace], [workspace.tag]), [
    workspace,
  ]);
  assert.throws(
    () => selectRequestedReleases([workspace], ["@microsoft/unknown_v1.0.0"]),
    /Unknown requested release tags/,
  );
});

test("validateReleaseManifest accepts matching metadata and artifacts", () => {
  assert.equal(
    validateReleaseManifest(metadata(), {
      artifactHashes: new Map([[asset, hash]]),
      expectedCommit: commit,
      expectedValidationMode: false,
      workspaces: [workspace],
    }).releaseCommit,
    commit,
  );
});

test("validateReleaseManifest requires the multi-package manifest shape", () => {
  const legacyRelease = metadata().packages[0];
  assert.throws(
    () =>
      validateReleaseManifest(
        metadata({ packages: undefined, releases: [legacyRelease] }),
        {
          artifactHashes: new Map([[asset, hash]]),
          expectedCommit: commit,
          expectedValidationMode: false,
          workspaces: [workspace],
        },
      ),
    /manifest contains no packages/,
  );
});

test("validateReleaseManifest reports an unsupported schema version", () => {
  assert.throws(
    () =>
      validateReleaseManifest(metadata({ schemaVersion: 2 }), {
        artifactHashes: new Map([[asset, hash]]),
        expectedCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /unsupported schema version \(got 2, expected 1\)/,
  );
});

test("validateReleaseManifest rejects a mismatched source commit", () => {
  assert.throws(
    () =>
      validateReleaseManifest(metadata(), {
        artifactHashes: new Map([[asset, hash]]),
        expectedCommit: "f".repeat(40),
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /does not match build resource commit/,
  );
});

test("validateReleaseManifest rejects a tampered artifact", () => {
  assert.throws(
    () =>
      validateReleaseManifest(metadata(), {
        artifactHashes: new Map([[asset, "b".repeat(64)]]),
        expectedCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /failed SHA-256 validation/,
  );
});
