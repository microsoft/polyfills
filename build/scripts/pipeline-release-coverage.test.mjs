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

function publishGitHubJob(pipeline) {
  return publishStage(pipeline).jobs.find(job => job.job === "PublishGitHub");
}

function releaseCheckTask(pipeline) {
  return publishGitHubJob(pipeline).steps.find(
    step => step.name === "releaseCheck",
  );
}

test("CD static GitHub release coverage matches every publishable workspace", () => {
  assert.doesNotThrow(() =>
    validateStaticGitHubReleaseCoverage(
      listPublishableWorkspaces(repoRoot),
      readFileSync(pipelinePath, "utf8"),
    ),
  );
});

test("CD static GitHub release coverage rejects duplicate output prefixes", () => {
  const workspaces = listPublishableWorkspaces(repoRoot);
  const conflictingWorkspace = {
    ...workspaces[0],
    name: "@microsoft/conflicting-polyfill",
  };

  assert.throws(
    () =>
      validateStaticGitHubReleaseCoverage(
        [...workspaces, conflictingWorkspace],
        loadPipeline(),
      ),
    new RegExp(
      `Duplicate outputPrefix ${workspaces[0].outputPrefix}.*${workspaces[0].name}.*${conflictingWorkspace.name}`,
    ),
  );
});

test("CD static GitHub release coverage validates the releaseCheck producer", async t => {
  const workspaces = listPublishableWorkspaces(repoRoot);

  await t.test("missing producer", () => {
    const pipeline = loadPipeline();
    publishGitHubJob(pipeline).steps = publishGitHubJob(pipeline).steps.filter(
      step => step.name !== "releaseCheck",
    );
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /exactly one task named releaseCheck; found 0/,
    );
  });

  await t.test("renamed producer", () => {
    const pipeline = loadPipeline();
    releaseCheckTask(pipeline).name = "renamedReleaseCheck";
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /exactly one task named releaseCheck; found 0/,
    );
  });

  await t.test("duplicate producer", () => {
    const pipeline = loadPipeline();
    publishGitHubJob(pipeline).steps.push(
      structuredClone(releaseCheckTask(pipeline)),
    );
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /exactly one task named releaseCheck; found 2/,
    );
  });

  await t.test("wrong task type", () => {
    const pipeline = loadPipeline();
    releaseCheckTask(pipeline).task = "PowerShell@2";
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /releaseCheck must use Bash@3/,
    );
  });

  await t.test("wrong target type", () => {
    const pipeline = loadPipeline();
    releaseCheckTask(pipeline).inputs.targetType = "filePath";
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /releaseCheck targetType must be inline/,
    );
  });

  await t.test("wrong script", () => {
    const pipeline = loadPipeline();
    releaseCheckTask(pipeline).inputs.script =
      "node build/scripts/check-github-releases.mjs";
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /under strict shell mode/,
    );
  });

  await t.test("missing manifest environment variable", () => {
    const pipeline = loadPipeline();
    delete releaseCheckTask(pipeline).env.RELEASE_MANIFEST_PATH;
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /RELEASE_MANIFEST_PATH is missing or invalid/,
    );
  });

  await t.test("wrong manifest environment variable", () => {
    const pipeline = loadPipeline();
    releaseCheckTask(pipeline).env.RELEASE_MANIFEST_PATH = "wrong";
    assert.throws(
      () => validateStaticGitHubReleaseCoverage(workspaces, pipeline),
      /RELEASE_MANIFEST_PATH is missing or invalid/,
    );
  });
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
  const publishGitHub = publishGitHubJob(invalidTask);
  publishGitHub.steps.find(step => step.task === "GitHubRelease@1").inputs
    .gitHubConnection = "wrong";
  assert.throws(
    () => validateStaticGitHubReleaseCoverage(workspaces, invalidTask),
    /GitHubRelease@1 coverage is invalid/,
  );

  const unknownTask = loadPipeline();
  const unknownPublishJob = publishGitHubJob(unknownTask);
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
