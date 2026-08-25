import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  checkPublishPipeline,
  getStepBlocks,
  listPublishableWorkspaces,
  npmNameToOutputPrefix,
  validateUniquePrefixes,
} from "./check-publish-pipeline.mjs";

test("npmNameToOutputPrefix camel-cases a scoped microsoft package name", () => {
  assert.equal(
    npmNameToOutputPrefix("@microsoft/focusgroup-polyfill"),
    "focusgroupPolyfill",
  );
  assert.equal(
    npmNameToOutputPrefix("@microsoft/some-other-thing"),
    "someOtherThing",
  );
});

test("validateUniquePrefixes flags colliding output prefixes", () => {
  const failures = validateUniquePrefixes([
    { name: "@microsoft/a-b", outputPrefix: "aB" },
    { name: "@microsoft/a_b", outputPrefix: "aB" },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /both map to Azure output prefix 'aB'/);
});

test("validateUniquePrefixes passes when prefixes are unique", () => {
  const failures = validateUniquePrefixes([
    { name: "@microsoft/a", outputPrefix: "a" },
    { name: "@microsoft/b", outputPrefix: "b" },
  ]);
  assert.deepEqual(failures, []);
});

function pipelineFor(prefix, name) {
  return [
    "variables:",
    `  ${prefix}NeedsDeployment: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.${prefix}NeedsDeployment'] ]`,
    `  ${prefix}ReleaseTag: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.${prefix}ReleaseTag'] ]`,
    "steps:",
    "- task: DownloadGitHubRelease@0",
    `  displayName: "Download ${name} release assets"`,
    `  condition: and(succeeded(), eq(variables['${prefix}NeedsDeployment'], 'true'))`,
    "  inputs:",
    "    connection: fast",
    "    userRepository: microsoft/polyfills",
    "    defaultVersionType: 'specificTag'",
    `    version: '$(${prefix}ReleaseTag)'`,
    "    downloadPath: '$(System.ArtifactsDirectory)'",
  ].join("\n");
}

test("getStepBlocks isolates a single task block", () => {
  const pipeline = pipelineFor("focusgroupPolyfill", "@microsoft/focusgroup-polyfill");
  const blocks = getStepBlocks(pipeline, "- task: DownloadGitHubRelease@0");
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /connection: fast/);
});

test("checkPublishPipeline passes when the package is fully declared", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const failures = checkPublishPipeline(pipelineFor(prefix, name), [
    { name, outputPrefix: prefix },
  ]);
  assert.deepEqual(failures, []);
});

test("checkPublishPipeline rejects the wrong GitHub service connection", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    "connection: fast",
    "connection: polyfills",
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /Missing DownloadGitHubRelease@0 task/.test(f)));
});

test("checkPublishPipeline fails when the download task is missing", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    `displayName: "Download ${name} release assets"`,
    'displayName: "Download something-else release assets"',
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /Missing DownloadGitHubRelease@0 task/.test(f)));
});

test("checkPublishPipeline fails when a stage variable is missing", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    `  ${prefix}ReleaseTag: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.${prefix}ReleaseTag'] ]\n`,
    "",
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /Missing Package stage variable/.test(f)));
});

test("the real Azure pipeline covers every publishable workspace", () => {
  const pipeline = readFileSync(
    new URL("../../azure-pipelines-cd.yml", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    checkPublishPipeline(pipeline, listPublishableWorkspaces()),
    [],
  );
});
