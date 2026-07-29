import assert from "node:assert/strict";
import { test } from "node:test";

import {
  githubReleaseExists,
  npmNameToOutputPrefix,
} from "./download-github-releases.mjs";

const noSleep = async () => {};
const repo = "microsoft/polyfills";
const tag = "@microsoft/focusgroup-polyfill_v1.5.0";

function response({ status, body, throwOnJson }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (throwOnJson) {
        throw new SyntaxError("Unexpected token < in JSON");
      }
      return body;
    },
  };
}

test("npmNameToOutputPrefix matches the Azure output prefix mapping", () => {
  assert.equal(
    npmNameToOutputPrefix("@microsoft/focusgroup-polyfill"),
    "focusgroupPolyfill",
  );
});

test("githubReleaseExists returns false for a bare/legacy tag (404)", async () => {
  const result = await githubReleaseExists(repo, tag, {
    fetchImpl: async () => response({ status: 404 }),
    sleepImpl: noSleep,
  });
  assert.equal(result, false);
});

test("githubReleaseExists returns true for a real, matching release", async () => {
  const result = await githubReleaseExists(repo, tag, {
    fetchImpl: async () => response({ status: 200, body: { tag_name: tag } }),
    sleepImpl: noSleep,
  });
  assert.equal(result, true);
});

test("githubReleaseExists throws when a 2xx payload references a different tag", async () => {
  await assert.rejects(
    githubReleaseExists(repo, tag, {
      fetchImpl: async () =>
        response({ status: 200, body: { tag_name: "some-other-tag" } }),
      sleepImpl: noSleep,
    }),
    /unexpected payload/,
  );
});

test("githubReleaseExists throws on a malformed 2xx body", async () => {
  await assert.rejects(
    githubReleaseExists(repo, tag, {
      fetchImpl: async () => response({ status: 200, throwOnJson: true }),
      sleepImpl: noSleep,
    }),
    /malformed response/,
  );
});

test("githubReleaseExists retries transient 5xx then succeeds", async () => {
  let calls = 0;
  const result = await githubReleaseExists(repo, tag, {
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) {
        return response({ status: 503 });
      }
      return response({ status: 200, body: { tag_name: tag } });
    },
    sleepImpl: noSleep,
  });
  assert.equal(result, true);
  assert.equal(calls, 3);
});

test("githubReleaseExists retries network errors then fails after exhausting attempts", async () => {
  let calls = 0;
  await assert.rejects(
    githubReleaseExists(repo, tag, {
      fetchImpl: async () => {
        calls += 1;
        throw new Error("ECONNRESET");
      },
      sleepImpl: noSleep,
      retries: 2,
    }),
    /failed after 3 attempt\(s\)/,
  );
  assert.equal(calls, 3);
});

test("githubReleaseExists fails safe (no retry) on a non-transient 4xx", async () => {
  let calls = 0;
  await assert.rejects(
    githubReleaseExists(repo, tag, {
      fetchImpl: async () => {
        calls += 1;
        return response({ status: 401 });
      },
      sleepImpl: noSleep,
    }),
    /failed: 401/,
  );
  assert.equal(calls, 1);
});
