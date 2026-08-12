import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  errorMessage,
  escapeAzureLoggingCommandData,
  reportReleaseScriptError,
} from "./release-script-error.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptFailures = [
  {
    message: /release manifest path argument is required/,
    script: "check-github-releases.mjs",
  },
  {
    message: /Usage: manage-release-tags\.mjs/,
    script: "manage-release-tags.mjs",
  },
  {
    message: /SELECTED_RELEASE_TAGS is required/,
    script: "prepare-release-artifacts.mjs",
  },
  {
    message: /RELEASE_MANIFEST_PATH.*are required/,
    script: "validate-release-artifacts.mjs",
  },
];

function withoutAzureEnvironment() {
  const env = { ...process.env };
  delete env.TF_BUILD;
  delete env.RELEASE_ARTIFACT_DIR;
  delete env.RELEASE_COMMIT;
  delete env.RELEASE_MANIFEST_PATH;
  delete env.RELEASE_TAGS;
  delete env.SELECTED_RELEASE_TAGS;
  return env;
}

function invoke(script, azure) {
  const env = withoutAzureEnvironment();
  if (azure) env.TF_BUILD = "True";
  return spawnSync(
    process.execPath,
    [join(repoRoot, "build", "scripts", script)],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    },
  );
}

test("reports plain local entrypoint errors", () => {
  const previousTfBuild = process.env.TF_BUILD;
  const output = [];
  delete process.env.TF_BUILD;

  try {
    reportReleaseScriptError(new Error("local failure"), message =>
      output.push(message),
    );
    assert.deepEqual(output, ["local failure"]);
  } finally {
    if (previousTfBuild === undefined) delete process.env.TF_BUILD;
    else process.env.TF_BUILD = previousTfBuild;
  }
});

test("reports escaped Azure logging-command errors", () => {
  const previousTfBuild = process.env.TF_BUILD;
  const output = [];
  process.env.TF_BUILD = "True";

  try {
    reportReleaseScriptError(new Error("failed 100%\r\nnext"), message =>
      output.push(message),
    );
    assert.deepEqual(output, [
      "##vso[task.logissue type=error]failed 100%AZP25%0D%0Anext",
    ]);
    assert.equal(
      escapeAzureLoggingCommandData("%\r\n"),
      "%AZP25%0D%0A",
    );
  } finally {
    if (previousTfBuild === undefined) delete process.env.TF_BUILD;
    else process.env.TF_BUILD = previousTfBuild;
  }
});

test("converts non-Error thrown values without exposing stacks", () => {
  assert.equal(errorMessage("string failure"), "string failure");
  assert.equal(errorMessage(42), "42");
  assert.equal(errorMessage(null), "null");
  assert.equal(errorMessage(Symbol("failure")), "Symbol(failure)");
  assert.equal(
    errorMessage({
      toString() {
        throw new Error("conversion secret");
      },
    }),
    "Unknown error",
  );
});

for (const { message, script } of scriptFailures) {
  test(`${script} retains plain local entrypoint failure behavior`, () => {
    const result = invoke(script, false);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /##vso|(?:^|\n)\s+at\s/u);
    assert.equal(result.stdout, "");
  });

  test(`${script} emits one Azure entrypoint error`, () => {
    const result = invoke(script, true);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /^##vso\[task\.logissue type=error\]/u);
    assert.equal(
      result.stderr.trim().split("\n").length,
      1,
      result.stderr,
    );
    assert.doesNotMatch(result.stderr, /(?:^|\n)\s+at\s/u);
    assert.equal(result.stdout, "");
  });
}
