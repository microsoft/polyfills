import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkBuildPipeline,
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
    "resources:",
    "  pipelines:",
    "  - pipeline: releaseBuild",
    "    source: Polyfills - CD Build",
    "    trigger:",
    "      stages:",
    "      - BuildArtifacts",
    "stages:",
    "- stage: ValidateArtifacts",
    "  env:",
    "    EXPECTED_RELEASE_COMMIT: $(resources.pipeline.releaseBuild.sourceCommit)",
    "    EXPECTED_VALIDATION_MODE: ${{ parameters.validationMode }}",
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

const packTemplate = [
  "parameters:",
  "- name: validationMode",
  "steps:",
  "- script: npm ci",
  "- script: npm run build",
  "- script: npm run prepare-release-artifacts",
  "  env:",
  "    SELECTED_RELEASE_TAGS: $(releaseTags)",
  "    VALIDATION_MODE: ${{ parameters.validationMode }}",
  "- task: PublishPipelineArtifact@1",
  "  inputs:",
  "    artifactName: npm-packages",
  "- task: PublishPipelineArtifact@1",
  "  inputs:",
  "    artifactName: release-metadata",
].join("\n");

const buildPipeline = [
  "stages:",
  "- stage: PrepareRelease",
  "- ${{ if eq(parameters.validationMode, 'false') }}:",
  "  - stage: BuildArtifacts",
  "    dependsOn: PrepareRelease",
  "    condition: eq(dependencies.PrepareRelease.outputs['SelectRelease.release.shouldBuild'], 'true')",
  "    variables:",
  "      releaseTags: $[ stageDependencies.PrepareRelease.SelectRelease.outputs['release.releaseTags'] ]",
  "    steps:",
  "    - template: templates/pack-release-steps.yml",
  "      parameters:",
  "        validationMode: ${{ parameters.validationMode }}",
  "- ${{ if eq(parameters.validationMode, 'true') }}:",
  "  - stage: ValidateArtifacts",
  "    dependsOn: PrepareRelease",
  "    condition: eq(dependencies.PrepareRelease.outputs['SelectRelease.release.shouldBuild'], 'true')",
  "    variables:",
  "      releaseTags: $[ stageDependencies.PrepareRelease.SelectRelease.outputs['release.releaseTags'] ]",
  "    steps:",
  "    - template: templates/pack-release-steps.yml",
  "      parameters:",
  "        validationMode: ${{ parameters.validationMode }}",
].join("\n");

test("checkBuildPipeline accepts mutually exclusive shared-template stages", () => {
  assert.deepEqual(checkBuildPipeline(buildPipeline, packTemplate), []);
});

test("checkBuildPipeline rejects an unconditional artifact stage", () => {
  const pipeline = buildPipeline.replace(
    "- ${{ if eq(parameters.validationMode, 'true') }}:",
    "- stage: ValidateArtifacts\n- ${{ if eq(parameters.validationMode, 'true') }}:",
  );
  const failures = checkBuildPipeline(pipeline, packTemplate);
  assert.ok(failures.some(f => /ValidateArtifacts must exist only/.test(f)));
});

test("checkBuildPipeline requires both stages to use the shared template", () => {
  const pipeline = buildPipeline.replace(
    "    - template: templates/pack-release-steps.yml",
    "    - script: npm ci",
  );
  const failures = checkBuildPipeline(pipeline, packTemplate);
  assert.ok(failures.some(f => /normal-mode artifact stage is missing/.test(f)));
});

test("checkBuildPipeline preserves releaseTags in the shared template", () => {
  const template = packTemplate.replace(
    "SELECTED_RELEASE_TAGS: $(releaseTags)",
    "SELECTED_RELEASE_TAGS: ''",
  );
  const failures = checkBuildPipeline(buildPipeline, template);
  assert.ok(failures.some(f => /Shared pack template is missing/.test(f)));
});

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

test("checkPublishPipeline rejects ValidateArtifacts in the CD trigger", () => {
  const name = "@microsoft/focusgroup-polyfill";
  const prefix = "focusgroupPolyfill";
  const pipeline = pipelineFor(prefix, name).replace(
    "- BuildArtifacts",
    "- BuildArtifacts\n    - ValidateArtifacts",
  );
  const failures = checkPublishPipeline(pipeline, [{ name, outputPrefix: prefix }]);
  assert.ok(failures.some(f => /trigger must include only BuildArtifacts/.test(f)));
});
