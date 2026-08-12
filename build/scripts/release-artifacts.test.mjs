import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { formatAzureBuildNumber } from "./azure-build-number.mjs";
import {
  checkGitHubReleases,
  githubReleaseExists,
  selectedReleaseChecks,
} from "./check-github-releases.mjs";
import {
  createOriginTagChecker,
  formatSelectedReleaseTags,
  parseSelectedReleaseTags,
  recheckSelectedReleaseTags,
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
const secondWorkspace = {
  name: "@microsoft/second-polyfill",
  outputPrefix: "secondPolyfill",
  tag: "@microsoft/second-polyfill_v2.0.0",
  version: "2.0.0",
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

test("formats and resolves the exact build-stage selection and order", () => {
  assert.equal(
    formatSelectedReleaseTags([secondWorkspace, workspace]),
    `${secondWorkspace.tag},${workspace.tag}`,
  );
  assert.deepEqual(
    selectRequestedReleases(
      [workspace, secondWorkspace],
      [secondWorkspace.tag, workspace.tag],
    ),
    [secondWorkspace, workspace],
  );
  assert.throws(
    () => selectRequestedReleases([workspace], ["@microsoft/unknown_v1.0.0"]),
    /Invalid SELECTED_RELEASE_TAGS: unknown or non-publishable tags: @microsoft\/unknown_v1\.0\.0/,
  );
  assert.throws(
    () => selectRequestedReleases([workspace], [workspace.tag, workspace.tag]),
    /Invalid SELECTED_RELEASE_TAGS: duplicate selected tags/,
  );
  assert.throws(
    () => formatSelectedReleaseTags([{ tag: `${workspace.tag},bad` }]),
    /Invalid release tags/,
  );
  assert.throws(
    () =>
      selectRequestedReleases([workspace, { tag: `${workspace.tag},bad` }], [
        workspace.tag,
      ]),
    /Release tags cannot contain commas/,
  );
});

test("parseSelectedReleaseTags rejects missing, empty, or altered selections", () => {
  assert.deepEqual(
    parseSelectedReleaseTags(`${secondWorkspace.tag},${workspace.tag}`),
    [secondWorkspace.tag, workspace.tag],
  );
  assert.throws(
    () => parseSelectedReleaseTags(undefined),
    /SELECTED_RELEASE_TAGS is required/,
  );
  assert.throws(
    () => parseSelectedReleaseTags(null),
    /SELECTED_RELEASE_TAGS is required/,
  );
  assert.throws(
    () => parseSelectedReleaseTags([]),
    /SELECTED_RELEASE_TAGS is required/,
  );
  assert.throws(() => parseSelectedReleaseTags(""), /non-empty string/);
  assert.throws(
    () => parseSelectedReleaseTags(`${workspace.tag}, ${secondWorkspace.tag}`),
    /surrounding whitespace at indexes: 1/,
  );
  assert.throws(
    () => parseSelectedReleaseTags(` ${workspace.tag},${secondWorkspace.tag} `),
    /surrounding whitespace at indexes: 0, 1/,
  );
  assert.throws(
    () => parseSelectedReleaseTags(`${workspace.tag},`),
    /empty tags.*indexes: 1/,
  );
  assert.throws(
    () => parseSelectedReleaseTags(`,${workspace.tag}`),
    /empty tags.*indexes: 0/,
  );
});

test("selectRequestedReleases rejects malformed and unknown tags", () => {
  assert.throws(
    () => selectRequestedReleases([workspace], ["not-a-release-tag"]),
    /malformed release tags: not-a-release-tag/,
  );
  assert.throws(
    () => selectRequestedReleases([workspace], ["@microsoft/unknown_v1.0.0"]),
    /unknown or non-publishable tags: @microsoft\/unknown_v1\.0\.0/,
  );
});

test("recheckSelectedReleaseTags preserves an unchanged selection", () => {
  const checkedTags = [];
  const releases = [secondWorkspace, workspace];

  assert.equal(
    recheckSelectedReleaseTags(releases, false, {
      exists(tag) {
        checkedTags.push(tag);
        return false;
      },
    }),
    releases,
  );
  assert.deepEqual(checkedTags, [secondWorkspace.tag, workspace.tag]);
});

test("recheckSelectedReleaseTags reports every concurrent release tag", () => {
  assert.throws(
    () =>
      recheckSelectedReleaseTags([secondWorkspace, workspace], false, {
        exists(tag) {
          return tag === workspace.tag;
        },
      }),
    new RegExp(
      `Concurrent release detected: selected release tags appeared on origin after selection: ${workspace.tag.replaceAll(
        ".",
        "\\.",
      )}\\. Refusing to shrink or alter the selected release batch\\.`,
    ),
  );
  assert.throws(
    () =>
      recheckSelectedReleaseTags([secondWorkspace, workspace], false, {
        exists() {
          return true;
        },
      }),
    error =>
      error.message ===
      `Concurrent release detected: selected release tags appeared on origin after selection: ${secondWorkspace.tag}, ${workspace.tag}. Refusing to shrink or alter the selected release batch.`,
  );
});

test("recheckSelectedReleaseTags allows existing tags in validation mode", () => {
  assert.doesNotThrow(() =>
    recheckSelectedReleaseTags([workspace], true, {
      exists() {
        return true;
      },
    }),
  );
});

test("origin tag checker uses non-interactive exact git operations", () => {
  const commands = [];
  const checker = createOriginTagChecker(args => {
    commands.push(args);
    return { status: 2, stderr: "", stdout: "" };
  });

  assert.equal(checker.exists(workspace.tag), false);
  assert.deepEqual(commands, [
    [
      "ls-remote",
      "--exit-code",
      "--refs",
      "--tags",
      "origin",
      `refs/tags/${workspace.tag}`,
    ],
  ]);
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

test("GitHub release checks map selected manifest packages to workspace prefixes", () => {
  assert.deepEqual(
    selectedReleaseChecks(
      metadata({
        packages: [
          metadata().packages[0],
          {
            asset: "second.tgz",
            name: secondWorkspace.name,
            sha256: hash,
            tag: secondWorkspace.tag,
            version: secondWorkspace.version,
          },
        ],
      }),
      [workspace, secondWorkspace],
    ),
    [
      {
        name: workspace.name,
        outputName: "focusgroupPolyfillGitHubReleaseExists",
        tag: workspace.tag,
      },
      {
        name: secondWorkspace.name,
        outputName: "secondPolyfillGitHubReleaseExists",
        tag: secondWorkspace.tag,
      },
    ],
  );
});

test("GitHub release checks emit existing and missing outputs for selected packages", async () => {
  const outputs = [];
  const queried = [];
  const results = await checkGitHubReleases(
    metadata({
      packages: [
        metadata().packages[0],
        {
          asset: "second.tgz",
          name: secondWorkspace.name,
          sha256: hash,
          tag: secondWorkspace.tag,
          version: secondWorkspace.version,
        },
      ],
    }),
    {
      workspaces: [workspace, secondWorkspace],
      releaseExists: async tag => {
        queried.push(tag);
        return tag === workspace.tag;
      },
      emitOutput: (name, value) => outputs.push([name, value]),
      log() {},
    },
  );

  assert.deepEqual(queried, [workspace.tag, secondWorkspace.tag]);
  assert.deepEqual(outputs, [
    ["focusgroupPolyfillGitHubReleaseExists", "true"],
    ["secondPolyfillGitHubReleaseExists", "false"],
  ]);
  assert.deepEqual(
    results.map(({ tag, exists }) => ({ tag, exists })),
    [
      { tag: workspace.tag, exists: true },
      { tag: secondWorkspace.tag, exists: false },
    ],
  );
});

test("GitHub release checks reject stale manifest tags before API queries", async () => {
  let queried = false;
  await assert.rejects(
    checkGitHubReleases(
      metadata({
        packages: [
          {
            ...metadata().packages[0],
            tag: "@microsoft/focusgroup-polyfill_v1.5.0",
          },
        ],
      }),
      {
        workspaces: [workspace],
        releaseExists: async () => {
          queried = true;
          return false;
        },
      },
    ),
    /does not match current workspace tag/,
  );
  assert.equal(queried, false);
});

test("GitHub release API distinguishes existing and missing releases", async () => {
  assert.equal(
    await githubReleaseExists(workspace.tag, {
      fetchImpl: async () => ({
        json: async () => ({ tag_name: workspace.tag }),
        status: 200,
      }),
    }),
    true,
  );
  assert.equal(
    await githubReleaseExists(workspace.tag, {
      fetchImpl: async () => ({ status: 404 }),
    }),
    false,
  );
});

test("GitHub release API failures fail explicitly", async () => {
  await assert.rejects(
    githubReleaseExists(workspace.tag, {
      fetchImpl: async () => ({
        status: 403,
        statusText: "Forbidden",
        text: async () => "rate limited",
      }),
    }),
    /Failed to query GitHub Release.*HTTP 403 Forbidden: rate limited/,
  );
  await assert.rejects(
    githubReleaseExists(workspace.tag, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    }),
    /Failed to query GitHub Release.*network down/,
  );
});

test("PublishRelease orders npm, deployment markers, and GitHub publication", () => {
  const pipeline = readFileSync(
    new URL("../../.ado/pipelines/azure-pipelines-cd.yml", import.meta.url),
    "utf8",
  );
  const publishNpm = pipeline.indexOf("- job: PublishNpm");
  const markDeployed = pipeline.indexOf("- job: MarkDeployed");
  const publishGitHub = pipeline.indexOf("- job: PublishGitHub");

  assert.ok(publishNpm > 0);
  assert.ok(publishNpm < markDeployed);
  assert.ok(markDeployed < publishGitHub);
  assert.match(
    pipeline,
    /- job: MarkDeployed[\s\S]*?dependsOn: PublishNpm\n\s+condition: succeeded\(\)/,
  );
  assert.match(
    pipeline,
    /- job: PublishGitHub[\s\S]*?dependsOn: MarkDeployed\n\s+condition: succeeded\(\)/,
  );
  assert.match(
    pipeline,
    /condition: and\(succeeded\(\), eq\(variables\['focusgroupPolyfillIncluded'\], 'true'\), eq\(variables\['releaseCheck\.focusgroupPolyfillGitHubReleaseExists'\], 'false'\)\)/,
  );
  assert.match(pipeline, /artifact: npm_packages/);
  assert.match(pipeline, /artifact: release-metadata/);
});

test("pipelines use selected build tags, renamed local directories, and narrow checkouts", () => {
  const buildPipeline = readFileSync(
    new URL("../../.ado/pipelines/azure-pipelines-build.yml", import.meta.url),
    "utf8",
  );
  const packTemplate = readFileSync(
    new URL(
      "../../.ado/pipelines/templates/pack-release-steps.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const cdPipeline = readFileSync(
    new URL("../../.ado/pipelines/azure-pipelines-cd.yml", import.meta.url),
    "utf8",
  );
  const tagManager = readFileSync(
    new URL("./manage-release-tags.mjs", import.meta.url),
    "utf8",
  );
  const preparationScript = readFileSync(
    new URL("./prepare-release-artifacts.mjs", import.meta.url),
    "utf8",
  );
  const beachballConfig = readFileSync(
    new URL("../../beachball.config.js", import.meta.url),
    "utf8",
  );
  const gitignore = readFileSync(
    new URL("../../.gitignore", import.meta.url),
    "utf8",
  );

  assert.match(buildPipeline, /release\.selectedReleaseTags/);
  assert.doesNotMatch(buildPipeline, /release\.releaseTags/);
  assert.match(preparationScript, /"selectedReleaseTags"/);
  assert.doesNotMatch(preparationScript, /"releaseTags"/);
  assert.match(packTemplate, /publish_artifacts_npm/);
  assert.match(packTemplate, /publish_artifacts_meta/);
  assert.match(cdPipeline, /publish_artifacts_npm/);
  assert.match(beachballConfig, /publish_artifacts_npm/);
  assert.match(gitignore, /publish_artifacts_npm/);
  assert.match(gitignore, /publish_artifacts_meta/);
  assert.doesNotMatch(
    `${packTemplate}\n${cdPipeline}\n${preparationScript}\n${beachballConfig}\n${gitignore}`,
    /publish_artifacts\/|release_metadata/,
  );
  assert.doesNotMatch(
    `${buildPipeline}\n${packTemplate}\n${cdPipeline}`,
    /fetchDepth:\s*0|fetchTags:\s*true/,
  );
  assert.equal(
    (
      `${buildPipeline}\n${packTemplate}\n${cdPipeline}`.match(
        /checkout: self/g,
      ) ?? []
    ).length,
    (
      `${buildPipeline}\n${packTemplate}\n${cdPipeline}`.match(
        /fetchDepth: 1/g,
      ) ?? []
    ).length,
  );
  assert.doesNotMatch(
    `${tagManager}\n${preparationScript}`,
    /"fetch",[\s\S]{0,100}"--tags"/,
  );
  assert.match(tagManager, /"ls-remote"/);
  assert.match(tagManager, /"--no-tags"/);

  assert.equal(
    (
      `${buildPipeline}\n${packTemplate}\n${cdPipeline}`.match(
        /persistCredentials: true/g,
      ) ?? []
    ).length,
    4,
  );
  assert.match(
    cdPipeline,
    /- job: PublishNpm[\s\S]*?- checkout: self\n\s+clean: true\n\s+fetchDepth: 1\n\s+fetchTags: false\n\n/,
  );
  assert.match(
    cdPipeline,
    /- job: PublishGitHub[\s\S]*?- checkout: self\n\s+clean: true\n\s+fetchDepth: 1\n\s+fetchTags: false\n\n/,
  );
});
