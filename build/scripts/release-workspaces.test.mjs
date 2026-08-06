import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  expandWorkspacePattern,
  listPublishableWorkspaces,
} from "./release-workspaces.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let fixtureId = 0;

function withFixture(run) {
  const root = join(
    repoRoot,
    `.release-workspaces-test-${process.pid}-${fixtureId++}`,
  );
  mkdirSync(root);

  try {
    return run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function createDirectory(root, relativePath) {
  mkdirSync(join(root, relativePath), { recursive: true });
}

function writePackage(root, relativePath, packageJson) {
  const directory = join(root, relativePath);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

test("expandWorkspacePattern treats RegExp metacharacters literally", () => {
  withFixture(root => {
    const expected = "group.+(alpha)[v1]{draft}^$one";
    createDirectory(root, join("packages", expected));
    createDirectory(root, join("packages", "groupZZalphav1draftone"));

    assert.deepEqual(
      expandWorkspacePattern(
        "packages/group.+(alpha)[v1]{draft}^$*",
        root,
      ),
      [join("packages", expected)],
    );
  });
});

test("expandWorkspacePattern expands wildcards across nested segments", () => {
  withFixture(root => {
    const expected = [
      join("packages", "alpha", "plugins", "first-polyfill"),
      join("packages", "beta", "plugins", "second-polyfill"),
    ];
    for (const path of expected) {
      createDirectory(root, path);
    }
    createDirectory(root, join("packages", "alpha", "plugins", "not-a-package"));

    assert.deepEqual(
      expandWorkspacePattern("packages/*/plugins/*-polyfill", root).sort(),
      expected,
    );
  });
});

test("expandWorkspacePattern accepts slash and backslash separators", () => {
  withFixture(root => {
    const expected = [
      join("packages", "alpha", "plugins", "first-polyfill"),
      join("packages", "beta", "plugins", "second-polyfill"),
    ];
    for (const path of expected) {
      createDirectory(root, path);
    }

    const slashPaths = expandWorkspacePattern(
      "packages/*/plugins/*-polyfill",
      root,
    ).sort();
    const backslashPaths = expandWorkspacePattern(
      "packages\\*\\plugins\\*-polyfill",
      root,
    ).sort();

    assert.deepEqual(slashPaths, expected);
    assert.deepEqual(backslashPaths, expected);
  });
});

test("listPublishableWorkspaces excludes private and incomplete packages", () => {
  withFixture(root => {
    writePackage(root, ".", {
      private: true,
      workspaces: {
        packages: ["packages/*", "nested\\*\\plugins\\*"],
      },
    });
    writePackage(root, "packages/alpha", {
      name: "@microsoft/alpha-polyfill",
      version: "1.2.3",
    });
    writePackage(root, "nested/group/plugins/beta", {
      name: "@microsoft/beta-polyfill",
      version: "2.0.0",
    });
    writePackage(root, "packages/private", {
      name: "@microsoft/private-polyfill",
      private: true,
      version: "1.0.0",
    });
    writePackage(root, "packages/missing-name", {
      version: "1.0.0",
    });
    writePackage(root, "packages/missing-version", {
      name: "@microsoft/missing-version",
    });
    createDirectory(root, "packages/missing-package-json");

    assert.deepEqual(listPublishableWorkspaces(root), [
      {
        location: join("packages", "alpha"),
        name: "@microsoft/alpha-polyfill",
        outputPrefix: "alphaPolyfill",
        tag: "@microsoft/alpha-polyfill_v1.2.3",
        version: "1.2.3",
      },
      {
        location: join("nested", "group", "plugins", "beta"),
        name: "@microsoft/beta-polyfill",
        outputPrefix: "betaPolyfill",
        tag: "@microsoft/beta-polyfill_v2.0.0",
        version: "2.0.0",
      },
    ]);
  });
});
