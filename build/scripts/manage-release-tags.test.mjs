import assert from "node:assert/strict";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createReleaseTagManager,
  gitResult,
  validateReleaseCommit,
} from "./manage-release-tags.mjs";
import { parseReleaseTagCsv } from "./release-tag-csv.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = join(repoRoot, "build", "scripts", "manage-release-tags.mjs");
let fixtureId = 0;

function git(cwd, args) {
  return execFileSync(
    "git",
    cwd.endsWith(".git") ? ["--git-dir=.", ...args] : args,
    { cwd, encoding: "utf8" },
  ).trim();
}

function withGitHarness(run) {
  const root = join(
    repoRoot,
    `.manage-release-tags-test-${process.pid}-${fixtureId++}`,
  );
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  const work = join(root, "work");
  mkdirSync(root);

  try {
    git(root, ["init", "--bare", origin]);
    git(root, ["init", seed]);
    git(seed, ["config", "user.name", "Test Author"]);
    git(seed, ["config", "user.email", "test@example.com"]);
    writeFileSync(join(seed, "file.txt"), "first\n");
    git(seed, ["add", "file.txt"]);
    git(seed, ["commit", "-m", "first"]);
    git(seed, ["branch", "-M", "main"]);
    git(seed, ["remote", "add", "origin", origin]);
    git(seed, ["push", "-u", "origin", "main"]);
    git(origin, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    git(root, ["clone", "--no-tags", `file://${origin}`, work]);

    return run({
      commit: git(seed, ["rev-parse", "HEAD"]),
      origin,
      root,
      seed,
      work,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function remotePeeledCommit(origin, tag) {
  return git(origin, ["rev-parse", `refs/tags/${tag}^{commit}`]);
}

test("strict release tag CSV parsing validates shape and duplicates", () => {
  const tag = "@microsoft/focusgroup-polyfill_v1.6.0";
  assert.deepEqual(parseReleaseTagCsv(tag), [tag]);
  assert.throws(() => parseReleaseTagCsv(""), /required.*non-empty string/);
  assert.throws(() => parseReleaseTagCsv(`${tag}, ${tag}`), /whitespace/);
  assert.throws(() => parseReleaseTagCsv(`${tag},`), /empty tags/);
  assert.throws(() => parseReleaseTagCsv("not-a-tag"), /malformed release tags/);
  assert.throws(
    () => parseReleaseTagCsv(`${tag},${tag}`),
    /duplicate release tags/,
  );
});

test("release commit validation fails closed", () => {
  assert.equal(validateReleaseCommit("a".repeat(40)), "a".repeat(40));
  assert.throws(() => validateReleaseCommit("abc"), /full lowercase/);
  assert.throws(() => validateReleaseCommit("A".repeat(40)), /full lowercase/);
  assert.throws(
    () => validateReleaseCommit(` ${"a".repeat(40)}`),
    /full lowercase/,
  );
});

test("tag manager exports reject empty, malformed, and duplicate tag arrays", () => {
  const manager = createReleaseTagManager({
    execute() {
      throw new Error("git must not run for invalid input");
    },
  });
  const commit = "a".repeat(40);
  const tag = "@microsoft/focusgroup-polyfill_v1.6.0";
  assert.throws(() => manager.create([], commit), /non-empty array/);
  assert.throws(() => manager.create(["not-a-tag"], commit), /Invalid release tags/);
  assert.throws(() => manager.markDeployed([tag, tag], commit), /duplicate/);
});

test("create and mark-deployed are annotated, isolated, and idempotent", () => {
  withGitHarness(({ commit, origin, work }) => {
    const tag = "@microsoft/focusgroup-polyfill_v1.6.0";
    const logs = [];
    const manager = createReleaseTagManager({
      cwd: work,
      log: message => logs.push(message),
      now: () => new Date("2026-08-12T00:00:00Z"),
    });

    manager.create([tag], commit);
    assert.equal(git(origin, ["cat-file", "-t", `refs/tags/${tag}`]), "tag");
    assert.equal(remotePeeledCommit(origin, tag), commit);
    assert.equal(git(work, ["tag", "--list"]), "");

    manager.create([tag], commit);
    assert.match(logs.at(-1), /already points to/);

    manager.markDeployed([tag], commit);
    assert.equal(
      git(origin, ["cat-file", "-t", `refs/tags/deployed/${tag}`]),
      "commit",
    );
    assert.equal(remotePeeledCommit(origin, `deployed/${tag}`), commit);
    manager.markDeployed([tag], commit);
    assert.match(logs.at(-1), /already marks the expected release/);
    assert.equal(git(work, ["tag", "--list"]), "");
  });
});

test("tag creation and deployment markers accept same-commit push races", () => {
  withGitHarness(({ commit, seed, work }) => {
    const tag = "@microsoft/focusgroup-polyfill_v1.6.0";
    let racedCreate = false;
    const createManager = createReleaseTagManager({
      cwd: work,
      execute(args, options) {
        if (!racedCreate && args[0] === "push") {
          racedCreate = true;
          git(seed, ["tag", "-a", tag, commit, "-m", `Concurrent ${tag}`]);
          git(seed, ["push", "origin", `refs/tags/${tag}`]);
        }
        return gitResult(args, { cwd: work, ...options });
      },
    });
    assert.doesNotThrow(() => createManager.create([tag], commit));

    let racedMarker = false;
    const markerManager = createReleaseTagManager({
      cwd: work,
      execute(args, options) {
        if (!racedMarker && args[0] === "push") {
          racedMarker = true;
          git(seed, ["tag", `deployed/${tag}`, commit]);
          git(seed, ["push", "origin", `refs/tags/deployed/${tag}`]);
        }
        return gitResult(args, { cwd: work, ...options });
      },
    });
    assert.doesNotThrow(() => markerManager.markDeployed([tag], commit));
  });
});

test("tag manager rejects conflicting remote tags and markers", () => {
  withGitHarness(({ commit, seed, work }) => {
    const tag = "@microsoft/focusgroup-polyfill_v1.6.0";
    writeFileSync(join(seed, "file.txt"), "second\n");
    git(seed, ["commit", "-am", "second"]);
    const otherCommit = git(seed, ["rev-parse", "HEAD"]);
    git(seed, ["tag", "-a", tag, otherCommit, "-m", "wrong release"]);
    git(seed, ["push", "origin", `refs/tags/${tag}`]);

    const manager = createReleaseTagManager({ cwd: work });
    assert.throws(
      () => manager.create([tag], commit),
      new RegExp(`${tag.replaceAll(".", "\\.")} points to ${otherCommit}`),
    );
    assert.throws(
      () => manager.markDeployed([tag], commit),
      new RegExp(`${tag.replaceAll(".", "\\.")} points to ${otherCommit}`),
    );
  });
});

test("CLI rejects missing commands and invalid environment input", () => {
  const invoke = (args, env = {}) =>
    spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    });

  const missingCommand = invoke([]);
  assert.equal(missingCommand.status, 1);
  assert.match(missingCommand.stderr, /Usage:/);

  const missingCommit = invoke(["create"], {
    RELEASE_TAGS: "@microsoft/focusgroup-polyfill_v1.6.0",
  });
  assert.equal(missingCommit.status, 1);
  assert.match(missingCommit.stderr, /RELEASE_COMMIT/);

  const invalidTags = invoke(["create"], {
    RELEASE_COMMIT: "a".repeat(40),
    RELEASE_TAGS: "not-a-tag",
  });
  assert.equal(invalidTags.status, 1);
  assert.match(invalidTags.stderr, /malformed release tags/);
});
