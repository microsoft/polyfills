import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkPublishPipeline,
  getStepBlocks,
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
    "source: Polyfills - CD Build",
    "stages:",
    "- BuildArtifacts",
    "- stage: PublishRelease",
    "variables:",
    `  ${prefix}Included: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${prefix}Included'] ]`,
    `  ${prefix}ReleaseTag: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${prefix}ReleaseTag'] ]`,
    `  ${prefix}ReleaseAsset: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${prefix}ReleaseAsset'] ]`,
    "jobs:",
    "- job: PublishGitHub",
    "  steps:",
    "  - task: GitHubRelease@1",
    `    displayName: "Create ${name} GitHub Release"`,
    `    condition: and(succeeded(), eq(variables['${prefix}Included'], 'true'))`,
    "    inputs:",
    "      gitHubConnection: fast",
    "      repositoryName: microsoft/polyfills",
    "      action: create",
    "      target: $(releaseCommit)",
    `      tag: $(${prefix}ReleaseTag)`,
    `      assets: $(Pipeline.Workspace)/releaseBuild/npm-packages/$(${prefix}ReleaseAsset)`,
    "- job: PublishNpm",
    "  steps:",
    "  - template: Polyfills.Release.PipelineTemplate.yml@polyfillsPipelines",
  ].join("\n");
}

test("getStepBlocks isolates a single task block", () => {
  const pipeline = pipelineFor("focusgroupPolyfill", "@microsoft/focusgroup-polyfill");
  const blocks = getStepBlocks(pipeline, "- task: GitHubRelease@1");
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /gitHubConnection: fast/);
});

test("checkPublishPipeline passes when the package is fully declared", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const failures = checkPublishPipeline(pipelineFor(prefix, name), [
    { name, outputPrefix: prefix },
  ]);
  assert.deepEqual(failures, []);
});

test("checkPublishPipeline fails when the GitHub release task is missing", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    `displayName: "Create ${name} GitHub Release"`,
    'displayName: "Create something-else GitHub Release"',
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /Missing GitHubRelease@1 task/.test(f)));
});

test("checkPublishPipeline fails when a stage variable is missing", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    `  ${prefix}ReleaseTag: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${prefix}ReleaseTag'] ]\n`,
    "",
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /Missing PublishRelease stage variable/.test(f)));
});

test("checkPublishPipeline rejects serial registry publication", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    "- job: PublishNpm",
    "- job: PublishNpm\n  dependsOn: PublishGitHub",
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /PublishNpm must remain an independent/.test(f)));
});
