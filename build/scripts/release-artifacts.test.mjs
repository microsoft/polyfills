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
  packSelectedReleases,
  selectReleases,
  updateBuildNumberAfterSelection,
} from "./prepare-release-artifacts.mjs";
import {
  validateReleaseManifest,
  validateReleaseManifestStructure,
} from "./release-manifest.mjs";
import {
  assertSelectedReleaseTagsNotOnOrigin,
  formatSelectedReleaseTags,
  parseSelectedReleaseTags,
  resolveSelectedReleases,
} from "./selected-release-tags.mjs";

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
    packages: [
      {
        name: workspace.name,
        npmAsset: { fileName: asset, sha256: hash },
        outputPrefix: workspace.outputPrefix,
        tag: workspace.tag,
        version: workspace.version,
      },
    ],
    schemaVersion: 1,
    sourceBranch: "refs/heads/main",
    sourceCommit: commit,
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
    resolveSelectedReleases(
      [workspace, secondWorkspace],
      [secondWorkspace.tag, workspace.tag],
    ),
    [secondWorkspace, workspace],
  );
  assert.throws(
    () => resolveSelectedReleases([workspace], ["@microsoft/unknown_v1.0.0"]),
    /Invalid SELECTED_RELEASE_TAGS: unknown or non-publishable tags: @microsoft\/unknown_v1\.0\.0/,
  );
  assert.throws(
    () => resolveSelectedReleases([workspace], [workspace.tag, workspace.tag]),
    /duplicate release tags/,
  );
  assert.throws(
    () => formatSelectedReleaseTags([{ tag: `${workspace.tag},bad` }]),
    /Invalid release tags/,
  );
  assert.throws(
    () =>
      resolveSelectedReleases(
        [workspace, { ...secondWorkspace, tag: workspace.tag }],
        [workspace.tag],
      ),
    /duplicate release tags/,
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

test("selected release parsing rejects malformed and resolution rejects unknown tags", () => {
  assert.throws(
    () => parseSelectedReleaseTags("not-a-release-tag"),
    /malformed release tags: not-a-release-tag/,
  );
  assert.throws(
    () => resolveSelectedReleases([workspace], ["@microsoft/unknown_v1.0.0"]),
    /unknown or non-publishable tags: @microsoft\/unknown_v1\.0\.0/,
  );
});

test("selected release origin assertion preserves an unchanged selection", () => {
  const checkedTags = [];
  const releases = [secondWorkspace, workspace];

  assert.equal(
    assertSelectedReleaseTagsNotOnOrigin(releases, false, {
      exists(tag) {
        checkedTags.push(tag);
        return false;
      },
    }),
    releases,
  );
  assert.deepEqual(checkedTags, [secondWorkspace.tag, workspace.tag]);
});

test("selected release origin assertion reports every concurrent release tag", () => {
  assert.throws(
    () =>
      assertSelectedReleaseTagsNotOnOrigin([secondWorkspace, workspace], false, {
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
      assertSelectedReleaseTagsNotOnOrigin([secondWorkspace, workspace], false, {
        exists() {
          return true;
        },
      }),
    error =>
      error.message ===
      `Concurrent release detected: selected release tags appeared on origin after selection: ${secondWorkspace.tag}, ${workspace.tag}. Refusing to shrink or alter the selected release batch.`,
  );
});

test("selected release origin assertion allows existing tags in validation mode", () => {
  assert.doesNotThrow(() =>
    assertSelectedReleaseTagsNotOnOrigin([workspace], true, {
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
      expectedSourceBranch: "refs/heads/main",
      expectedSourceCommit: commit,
      expectedValidationMode: false,
      workspaces: [workspace],
    }).sourceCommit,
    commit,
  );
});

test("validateReleaseManifest requires the multi-package manifest shape", () => {
  const legacyRelease = metadata().packages[0];
  assert.throws(
    () =>
      validateReleaseManifestStructure({
        ...metadata(),
        packages: undefined,
        releases: [legacyRelease],
      }),
    /must contain exactly/,
  );
});

test("validateReleaseManifest reports an unsupported schema version", () => {
  assert.throws(
    () =>
      validateReleaseManifest(metadata({ schemaVersion: 2 }), {
        artifactHashes: new Map([[asset, hash]]),
        expectedSourceBranch: "refs/heads/main",
        expectedSourceCommit: commit,
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
        expectedSourceBranch: "refs/heads/main",
        expectedSourceCommit: "f".repeat(40),
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
        expectedSourceBranch: "refs/heads/main",
        expectedSourceCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /failed SHA-256 validation/,
  );
  assert.throws(
    () =>
      validateReleaseManifest(metadata(), {
        artifactHashes: new Map(),
        expectedSourceBranch: "refs/heads/main",
        expectedSourceCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /Release asset .* is missing/,
  );
});

test("validateReleaseManifest enforces trusted branch and production main", () => {
  assert.throws(
    () =>
      validateReleaseManifest(metadata(), {
        artifactHashes: new Map([[asset, hash]]),
        expectedSourceBranch: "refs/heads/release",
        expectedSourceCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /does not match build resource branch/,
  );
  assert.throws(
    () =>
      validateReleaseManifest(metadata({ sourceBranch: "refs/heads/release" }), {
        artifactHashes: new Map([[asset, hash]]),
        expectedSourceBranch: "refs/heads/release",
        expectedSourceCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /Production release artifacts must come from refs\/heads\/main/,
  );
  assert.doesNotThrow(() =>
    validateReleaseManifest(
      metadata({
        sourceBranch: "refs/heads/release",
        validationMode: true,
      }),
      {
        artifactHashes: new Map([[asset, hash]]),
        expectedSourceBranch: "refs/heads/release",
        expectedSourceCommit: commit,
        expectedValidationMode: true,
        workspaces: [workspace],
      },
    ),
  );
});

test("validateReleaseManifest rejects outputPrefix drift and exact artifact drift", () => {
  assert.throws(
    () =>
      validateReleaseManifest(
        metadata({
          packages: [
            {
              ...metadata().packages[0],
              outputPrefix: "tamperedPrefix",
            },
          ],
        }),
        {
          artifactHashes: new Map([[asset, hash]]),
          expectedSourceBranch: "refs/heads/main",
          expectedSourceCommit: commit,
          expectedValidationMode: false,
          workspaces: [workspace],
        },
      ),
    /outputPrefix.*does not match the workspace/,
  );
  assert.throws(
    () =>
      validateReleaseManifest(metadata(), {
        artifactHashes: new Map([
          [asset, hash],
          ["unexpected.tgz", hash],
        ]),
        expectedSourceBranch: "refs/heads/main",
        expectedSourceCommit: commit,
        expectedValidationMode: false,
        workspaces: [workspace],
      }),
    /Unexpected release assets: unexpected\.tgz/,
  );
});

test("release manifest structure rejects unsafe files, invalid hashes, and duplicates", () => {
  assert.throws(
    () =>
      validateReleaseManifestStructure(
        metadata({
          packages: [
            {
              ...metadata().packages[0],
              npmAsset: { fileName: "../unsafe.tgz", sha256: hash },
            },
          ],
        }),
      ),
    /unsafe npm asset fileName/,
  );
  assert.throws(
    () =>
      validateReleaseManifestStructure(
        metadata({
          packages: [
            {
              ...metadata().packages[0],
              npmAsset: { fileName: asset, sha256: "invalid" },
            },
          ],
        }),
      ),
    /invalid npm asset SHA-256/,
  );
  assert.throws(
    () =>
      validateReleaseManifestStructure(
        metadata({
          packages: [
            metadata().packages[0],
            {
              ...metadata().packages[0],
              name: secondWorkspace.name,
              tag: secondWorkspace.tag,
            },
          ],
        }),
      ),
    /duplicate package names, tags, output prefixes, or npm asset file names/,
  );
});

test("packing attempts and aggregates multiple failures with a partial manifest", () => {
  const attempted = [];
  const errors = [];
  let written;
  const thirdWorkspace = {
    ...secondWorkspace,
    name: "@microsoft/third-polyfill",
    outputPrefix: "thirdPolyfill",
    tag: "@microsoft/third-polyfill_v3.0.0",
    version: "3.0.0",
  };
  const result = packSelectedReleases({
    artifactDir: "artifacts",
    hashFile: filePath => {
      assert.match(filePath, /second\.tgz$/);
      return hash;
    },
    log() {},
    logError: message => errors.push(message),
    metadataPath: "manifest.json",
    packRelease(release) {
      attempted.push(release.name);
      if (release === secondWorkspace) return "second.tgz";
      throw new Error(`pack failed for ${release.name}`);
    },
    releases: [workspace, secondWorkspace, thirdWorkspace],
    sourceBranch: "refs/heads/main",
    sourceCommit: commit,
    validationMode: false,
    writeManifest: (_path, manifest) => {
      written = manifest;
    },
  });

  assert.deepEqual(attempted, [
    workspace.name,
    secondWorkspace.name,
    thirdWorkspace.name,
  ]);
  assert.equal(result.failures.length, 2);
  assert.equal(errors.length, 2);
  assert.deepEqual(written.packages, [
    {
      name: secondWorkspace.name,
      npmAsset: { fileName: "second.tgz", sha256: hash },
      outputPrefix: secondWorkspace.outputPrefix,
      tag: secondWorkspace.tag,
      version: secondWorkspace.version,
    },
  ]);
});

test("packing writes an empty diagnostic manifest when every package fails", () => {
  let written;
  const result = packSelectedReleases({
    artifactDir: "artifacts",
    log() {},
    logError() {},
    metadataPath: "manifest.json",
    packRelease() {
      throw new Error("pack failed");
    },
    releases: [workspace, secondWorkspace],
    sourceBranch: "refs/heads/feature",
    sourceCommit: commit,
    validationMode: true,
    writeManifest: (_path, manifest) => {
      written = manifest;
    },
  });
  assert.equal(result.failures.length, 2);
  assert.deepEqual(written.packages, []);
  assert.equal(written.sourceBranch, "refs/heads/feature");
});

test("packing rejects an unsafe npm filename before hashing it", () => {
  let hashed = false;
  let written;
  const result = packSelectedReleases({
    artifactDir: "artifacts",
    hashFile() {
      hashed = true;
      return hash;
    },
    log() {},
    logError() {},
    metadataPath: "manifest.json",
    packRelease() {
      return "../outside.tgz";
    },
    releases: [workspace],
    sourceBranch: "refs/heads/main",
    sourceCommit: commit,
    validationMode: false,
    writeManifest: (_path, manifest) => {
      written = manifest;
    },
  });
  assert.equal(hashed, false);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(written.packages, []);
});

test("GitHub release checks map selected manifest packages to workspace prefixes", () => {
  assert.deepEqual(
    selectedReleaseChecks(
      metadata({
        packages: [
          metadata().packages[0],
          {
            name: secondWorkspace.name,
            npmAsset: { fileName: "second.tgz", sha256: hash },
            outputPrefix: secondWorkspace.outputPrefix,
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
          name: secondWorkspace.name,
          npmAsset: { fileName: "second.tgz", sha256: hash },
          outputPrefix: secondWorkspace.outputPrefix,
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
    /tag.*does not match the workspace/,
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
  assert.match(
    buildPipeline,
    /- task: Bash@3[\s\S]*?name: release[\s\S]*?targetType: inline[\s\S]*?set -euo pipefail\n\s+node build\/scripts\/prepare-release-artifacts\.mjs --check-only[\s\S]*?AZURE_BUILD_ID: \$\(Build\.BuildId\)[\s\S]*?VALIDATION_MODE:/,
  );
  assert.match(
    packTemplate,
    /- task: Bash@3[\s\S]*?targetType: inline[\s\S]*?set -euo pipefail\n\s+node build\/scripts\/prepare-release-artifacts\.mjs[\s\S]*?SELECTED_RELEASE_TAGS:[\s\S]*?VALIDATION_MODE:/,
  );
  assert.doesNotMatch(
    `${buildPipeline}\n${packTemplate}`,
    /npm run prepare-release-artifacts/,
  );
  assert.doesNotMatch(
    packTemplate,
    /BUILD_SOURCEBRANCH:|BUILD_SOURCEVERSION:/,
  );
  assert.doesNotMatch(packTemplate, /continueOnError/);
  assert.match(cdPipeline, /publish_artifacts_npm/);
  assert.match(
    cdPipeline,
    /EXPECTED_SOURCE_BRANCH: \$\(resources\.pipeline\.releaseBuild\.sourceBranch\)/,
  );
  assert.match(
    cdPipeline,
    /EXPECTED_SOURCE_COMMIT: \$\(resources\.pipeline\.releaseBuild\.sourceCommit\)/,
  );
  assert.doesNotMatch(cdPipeline, /EXPECTED_RELEASE_COMMIT/);
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
