import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parsePipelineYaml,
  validateStaticGitHubReleaseCoverage,
} from "./pipeline-release-coverage.mjs";
import { listPublishableWorkspaces } from "./release-workspaces.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const pipelinePath = new URL(
  "../../.ado/pipelines/azure-pipelines-cd.yml",
  import.meta.url,
);

function loadPipeline() {
  return parsePipelineYaml(readFileSync(pipelinePath, "utf8"));
}

function publishStage(pipeline) {
  return pipeline.extends.parameters.stages[1][
    "${{ if eq(parameters.validationMode, 'false') }}"
  ].find(stage => stage.stage === "PublishRelease");
}

test("CD static GitHub release coverage matches every publishable workspace", () => {
  assert.doesNotThrow(() =>
    validateStaticGitHubReleaseCoverage(
      listPublishableWorkspaces(repoRoot),
      readFileSync(pipelinePath, "utf8"),
    ),
  );
});

test("CD static GitHub release coverage detects variable and task drift bidirectionally", () => {
  const workspaces = listPublishableWorkspaces(repoRoot);

  const missingVariable = loadPipeline();
  delete publishStage(missingVariable).variables.focusgroupPolyfillReleaseAsset;
  assert.throws(
    () => validateStaticGitHubReleaseCoverage(workspaces, missingVariable),
    /Static release variable focusgroupPolyfillReleaseAsset is missing or invalid/,
  );

  const unknownVariable = loadPipeline();
  publishStage(unknownVariable).variables.unknownIncluded = "value";
  assert.throws(
    () => validateStaticGitHubReleaseCoverage(workspaces, unknownVariable),
    /Unknown static release variable unknownIncluded/,
  );

  const invalidTask = loadPipeline();
  const publishGitHub = publishStage(invalidTask).jobs.find(
    job => job.job === "PublishGitHub",
  );
  publishGitHub.steps.find(step => step.task === "GitHubRelease@1").inputs
    .gitHubConnection = "wrong";
  assert.throws(
    () => validateStaticGitHubReleaseCoverage(workspaces, invalidTask),
    /GitHubRelease@1 coverage is invalid/,
  );

  const unknownTask = loadPipeline();
  const unknownPublishJob = publishStage(unknownTask).jobs.find(
    job => job.job === "PublishGitHub",
  );
  const extraTask = structuredClone(
    unknownPublishJob.steps.find(step => step.task === "GitHubRelease@1"),
  );
  extraTask.inputs.tag = "$(unknownReleaseTag)";
  unknownPublishJob.steps.push(extraTask);
  assert.throws(
    () => validateStaticGitHubReleaseCoverage(workspaces, unknownTask),
    /Unknown GitHubRelease@1 task coverage for unknown/,
  );
});
