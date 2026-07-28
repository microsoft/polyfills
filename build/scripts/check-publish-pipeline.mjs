#!/usr/bin/env node
/**
 * Guardrail for Azure CD coverage.
 *
 * `cd-github-releases.yml` discovers publishable workspaces dynamically, but
 * `azure-pipelines-cd.yml` must declare one `DownloadGitHubRelease@0` task per
 * package because Azure Pipelines cannot create tasks from runtime output. This
 * script keeps those two surfaces in sync so a newly published package can never
 * silently fall out of the Azure deployment.
 *
 * For every non-private workspace it verifies that the pipeline declares the
 * matching `Package` stage output variables and a conditional
 * `DownloadGitHubRelease@0` task wired to the `polyfills` service connection.
 * It also fails when two packages collapse to the same Azure output prefix,
 * which would make their pipeline variables collide.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pipelinePath = join(repoRoot, "azure-pipelines-cd.yml");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function npmNameToOutputPrefix(npmName) {
  return npmName
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/^microsoft-/, "")
    .replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function listWorkspaceLocations() {
  const rootPkg = readJson("package.json");
  const patterns = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : (rootPkg.workspaces?.packages ?? []);
  const locations = new Set();

  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      const parentPath = join(repoRoot, parent);
      if (!existsSync(parentPath)) {
        continue;
      }
      for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          locations.add(join(parent, entry.name));
        }
      }
    } else {
      locations.add(pattern);
    }
  }

  return [...locations].sort();
}

function listPublishableWorkspaces() {
  return listWorkspaceLocations()
    .map(location => {
      const pkgPath = join(location, "package.json");
      const absolutePkgPath = join(repoRoot, pkgPath);
      if (!existsSync(absolutePkgPath)) {
        return null;
      }

      const pkg = JSON.parse(readFileSync(absolutePkgPath, "utf8"));
      if (pkg.private === true || !pkg.name || !pkg.version) {
        return null;
      }

      return {
        location,
        name: pkg.name,
        outputPrefix: npmNameToOutputPrefix(pkg.name),
      };
    })
    .filter(Boolean);
}

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
      const nextStep = current.match(/^(\s*)- (checkout|script|task|template):/);
      if (j > i && nextStep && nextStep[1].length === indent) {
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
  const downloadBlocks = getStepBlocks(pipeline, "- task: DownloadGitHubRelease@0");
  const failures = validateUniquePrefixes(publishable);

  for (const { name, outputPrefix } of publishable) {
    const needsVariable = `${outputPrefix}NeedsDeployment: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.${outputPrefix}NeedsDeployment'] ]`;
    const tagVariable = `${outputPrefix}ReleaseTag: $[ stageDependencies.Check.CheckVersion.outputs['deploymentCheck.${outputPrefix}ReleaseTag'] ]`;
    const condition = `condition: and(succeeded(), eq(variables['${outputPrefix}NeedsDeployment'], 'true'))`;
    const version = `version: '$(${outputPrefix}ReleaseTag)'`;

    if (!pipeline.includes(needsVariable)) {
      failures.push(`Missing Package stage variable for ${name}: ${needsVariable}`);
    }

    if (!pipeline.includes(tagVariable)) {
      failures.push(`Missing Package stage variable for ${name}: ${tagVariable}`);
    }

    const hasDownloadTask = downloadBlocks.some(
      block =>
        block.includes(`Download ${name} release assets`) &&
        block.includes(condition) &&
        block.includes("connection: polyfills") &&
        block.includes("userRepository: microsoft/polyfills") &&
        block.includes("defaultVersionType: 'specificTag'") &&
        block.includes(version),
    );

    if (!hasDownloadTask) {
      failures.push(
        `Missing DownloadGitHubRelease@0 task for ${name}. Add a task conditioned on '${outputPrefix}NeedsDeployment' and using '$(${outputPrefix}ReleaseTag)'.`,
      );
    }
  }

  return failures;
}

function main() {
  const pipeline = readFileSync(pipelinePath, "utf8");
  const publishable = listPublishableWorkspaces();
  const failures = checkPublishPipeline(pipeline, publishable);

  if (failures.length > 0) {
    console.error("[check-publish-pipeline] Azure CD publish coverage is incomplete.");
    console.error(
      "Every non-private workspace must be represented in azure-pipelines-cd.yml. See .github/workflows/README.md > Adding a publishable package.",
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
  listPublishableWorkspaces,
  npmNameToOutputPrefix,
  validateUniquePrefixes,
};
