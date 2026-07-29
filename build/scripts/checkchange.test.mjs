import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  fetchPermission,
  getBranchName,
  getToken,
  publishBranchPattern,
} from "./checkchange.mjs";

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, savedEnv);
  globalThis.fetch = savedFetch;
});

test("publishBranchPattern only matches beachball publish branches", () => {
  assert.ok(publishBranchPattern.test("publish_1700000000000"));
  assert.ok(!publishBranchPattern.test("publish_"));
  assert.ok(!publishBranchPattern.test("main"));
  assert.ok(!publishBranchPattern.test("users/foo/publish_123"));
});

test("getBranchName prefers GITHUB_HEAD_REF, then GITHUB_REF_NAME", () => {
  process.env.GITHUB_HEAD_REF = "feature-branch";
  process.env.GITHUB_REF_NAME = "refs-branch";
  assert.deepEqual(getBranchName(), {
    value: "feature-branch",
    source: "GITHUB_HEAD_REF",
  });

  delete process.env.GITHUB_HEAD_REF;
  assert.deepEqual(getBranchName(), {
    value: "refs-branch",
    source: "GITHUB_REF_NAME",
  });
});

test("getToken order is GITHUB_TOKEN, then GH_TOKEN", () => {
  process.env.GITHUB_TOKEN = "gh-actions-token";
  process.env.GH_TOKEN = "gh-cli-token";
  assert.deepEqual(getToken(), {
    value: "gh-actions-token",
    source: "GITHUB_TOKEN",
  });

  delete process.env.GITHUB_TOKEN;
  assert.deepEqual(getToken(), { value: "gh-cli-token", source: "GH_TOKEN" });
});

test("fetchPermission returns the permission on a successful response", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ permission: "admin" }),
  });
  const result = await fetchPermission("octocat", "token");
  assert.deepEqual(result, { error: null, permission: "admin" });
});

test("fetchPermission fails closed on a non-ok response", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    statusText: "Forbidden",
    json: async () => ({}),
  });
  const result = await fetchPermission("octocat", "token");
  assert.equal(result.permission, null);
  assert.match(result.error, /HTTP 403/);
});

test("fetchPermission fails closed when fetch throws", async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const result = await fetchPermission("octocat", "token");
  assert.equal(result.permission, null);
  assert.match(result.error, /network down/);
});
