#!/usr/bin/env node
/**
 * Guardrail for Azure CD coverage.
 *
 * The release build discovers and packs publishable workspaces dynamically, but
 * Azure Pipelines cannot create GitHubRelease tasks from runtime metadata. The
 * CD pipeline therefore declares one `GitHubRelease@1` task per package. This
 * script keeps those surfaces in sync so a newly published package can never
 * silently fall out of the Azure release.
 *
 * For every non-private workspace it verifies that the pipeline consumes the
 * matching validation outputs and has a conditional GitHub release task wired
 * to the repository's `fast` service connection.
 * It also fails when two packages collapse to the same Azure output prefix,
 * which would make their pipeline variables collide.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listPublishableWorkspaces,
  npmNameToOutputPrefix,
} from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pipelinePath = join(
  repoRoot,
  ".ado",
  "pipelines",
  "azure-pipelines-cd.yml",
);

function getStepBlocks(pipeline, stepHeader) {
  const lines = pipeline.split(/\r?\n/);
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(stepHeader)) {
      continue;
    }

    const indent = line.match(/^(\s*)-/)?.[1].length;
    if (indent === undefined) {
      continue;
    }

    const block = [];
    for (let j = i; j < lines.length; j++) {
      const current = lines[j];
      const nextItem = current.match(/^(\s*)- /);
      if (j > i && nextItem && nextItem[1].length <= indent) {
        break;
      }
      block.push(current);
    }
    blocks.push(block.join("\n"));
  }

  return blocks;
}

function validateUniquePrefixes(workspaces) {
  const seen = new Map();
  const failures = [];

  for (const workspace of workspaces) {
    const previous = seen.get(workspace.outputPrefix);
    if (previous) {
      failures.push(
        `${workspace.name} and ${previous.name} both map to Azure output prefix '${workspace.outputPrefix}'. Rename one package or update the prefix mapping.`,
      );
    } else {
      seen.set(workspace.outputPrefix, workspace);
    }
  }

  return failures;
}

function checkPublishPipeline(pipeline, publishable) {
  const releaseBlocks = getStepBlocks(pipeline, "- task: GitHubRelease@1");
  const failures = validateUniquePrefixes(publishable);
  const architectureRequirements = [
    "source: Polyfills - CD Build",
    "- BuildArtifacts",
    "- job: PublishGitHub",
    "- job: PublishNpm",
    "template: Polyfills.Release.PipelineTemplate.yml@polyfillsPipelines",
  ];

  for (const requirement of architectureRequirements) {
    if (!pipeline.includes(requirement)) {
      failures.push(`Missing Azure CD architecture requirement: ${requirement}`);
    }
  }

  for (const { name, outputPrefix } of publishable) {
    const includedVariable = `${outputPrefix}Included: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${outputPrefix}Included'] ]`;
    const tagVariable = `${outputPrefix}ReleaseTag: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${outputPrefix}ReleaseTag'] ]`;
    const assetVariable = `${outputPrefix}ReleaseAsset: $[ stageDependencies.ValidateArtifacts.Validate.outputs['release.${outputPrefix}ReleaseAsset'] ]`;
    const condition = `condition: and(succeeded(), eq(variables['${outputPrefix}Included'], 'true'))`;

    if (!pipeline.includes(includedVariable)) {
      failures.push(
        `Missing PublishRelease stage variable for ${name}: ${includedVariable}`,
      );
    }
    if (!pipeline.includes(tagVariable)) {
      failures.push(
        `Missing PublishRelease stage variable for ${name}: ${tagVariable}`,
      );
    }
    if (!pipeline.includes(assetVariable)) {
      failures.push(
        `Missing PublishRelease stage variable for ${name}: ${assetVariable}`,
      );
    }

    const hasReleaseTask = releaseBlocks.some(
      block =>
        block.includes(`Create ${name} GitHub Release`) &&
        block.includes(condition) &&
        block.includes("gitHubConnection: fast") &&
        block.includes("repositoryName: microsoft/polyfills") &&
        block.includes("action: create") &&
        block.includes("target: $(releaseCommit)") &&
        block.includes(`tag: $(${outputPrefix}ReleaseTag)`) &&
        block.includes(`$(${outputPrefix}ReleaseAsset)`),
    );

    if (!hasReleaseTask) {
      failures.push(
        `Missing GitHubRelease@1 task for ${name}. Add a task conditioned on '${outputPrefix}Included' and using its release tag and asset outputs.`,
      );
    }
  }

  for (const jobName of ["PublishGitHub", "PublishNpm"]) {
    const [jobBlock] = getStepBlocks(pipeline, `- job: ${jobName}`);
    const jobIndent = jobBlock?.match(/^(\s*)- job:/)?.[1] ?? "";
    if (
      !jobBlock ||
      new RegExp(`^${jobIndent}  dependsOn:`, "m").test(jobBlock)
    ) {
      failures.push(
        `${jobName} must remain an independent PublishRelease job so one destination cannot block the other.`,
      );
    }
  }

  return failures;
}

function main() {
  const pipeline = readFileSync(pipelinePath, "utf8");
  const publishable = listPublishableWorkspaces(repoRoot);
  const failures = checkPublishPipeline(pipeline, publishable);

  if (failures.length > 0) {
    console.error("[check-publish-pipeline] Azure CD publish coverage is incomplete.");
    console.error(
      "Every non-private workspace must be represented in .ado/pipelines/azure-pipelines-cd.yml. See .ado/pipelines/README.md > Adding a publishable package.",
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-publish-pipeline] Verified Azure CD coverage for ${publishable.length} publishable workspace(s).`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main();
}

export {
  checkPublishPipeline,
  getStepBlocks,
  npmNameToOutputPrefix,
  validateUniquePrefixes,
};
