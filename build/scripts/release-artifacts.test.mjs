import assert from "node:assert/strict";
import { test } from "node:test";

import {
  selectReleases,
  selectRequestedReleases,
} from "./prepare-release-artifacts.mjs";
import { validateReleaseMetadata } from "./validate-release-artifacts.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const workspace = {
  name: "@microsoft/focusgroup-polyfill",
  outputPrefix: "focusgroupPolyfill",
  tag: "@microsoft/focusgroup-polyfill_v1.6.0",
  version: "1.6.0",
};
const asset = "microsoft-focusgroup-polyfill-1.6.0.tgz";
const hash = "a".repeat(64);

function metadata(overrides = {}) {
  return {
    releaseCommit: commit,
    releases: [
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

test("validateReleaseMetadata accepts matching metadata and artifacts", () => {
  assert.equal(
    validateReleaseMetadata(metadata(), {
      artifactHashes: new Map([[asset, hash]]),
      expectedCommit: commit,
      expectedValidationMode: false,
      workspaces: [workspace],
    }).releaseCommit,
    commit,
  );
});

test("validateReleaseMetadata rejects a mismatched source commit", () => {
  assert.throws(
    () =>
      validateReleaseMetadata(metadata(), {
        artifactHashes: new Map([[asset, hash]]),
        expectedCommit: "f".repeat(40),
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /does not match build resource commit/,
  );
});

test("validateReleaseMetadata rejects a tampered artifact", () => {
  assert.throws(
    () =>
      validateReleaseMetadata(metadata(), {
        artifactHashes: new Map([[asset, "b".repeat(64)]]),
        expectedCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /failed SHA-256 validation/,
  );
});
