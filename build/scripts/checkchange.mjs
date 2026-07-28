#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repo = "microsoft/polyfills";
const requiredRole = "admin";
const publishBranchPattern = /^publish_\d+$/;
const apiTimeoutMs = 5000;

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function gh(args) {
  const result = spawnSync("gh", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function getBranchName() {
  if (process.env.GITHUB_HEAD_REF?.trim()) {
    return { value: process.env.GITHUB_HEAD_REF.trim(), source: "GITHUB_HEAD_REF" };
  }
  if (process.env.GITHUB_REF_NAME?.trim()) {
    return { value: process.env.GITHUB_REF_NAME.trim(), source: "GITHUB_REF_NAME" };
  }
  return { value: git(["rev-parse", "--abbrev-ref", "HEAD"]), source: "git" };
}

function getActorLogin() {
  if (process.env.GITHUB_ACTOR?.trim()) {
    return { value: process.env.GITHUB_ACTOR.trim(), source: "GITHUB_ACTOR" };
  }

  const login = gh(["api", "user", "--jq", ".login"]);
  return login
    ? { value: login, source: "gh api user" }
    : { value: null, source: null };
}

function getToken() {
  if (process.env.GITHUB_TOKEN?.trim()) {
    return { value: process.env.GITHUB_TOKEN.trim(), source: "GITHUB_TOKEN" };
  }

  if (process.env.GH_TOKEN?.trim()) {
    return { value: process.env.GH_TOKEN.trim(), source: "GH_TOKEN" };
  }

  const token = gh(["auth", "token"]);
  return token
    ? { value: token, source: "gh auth token" }
    : { value: null, source: null };
}

async function fetchPermission(login, token) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs);
  const url = `https://api.github.com/repos/${repo}/collaborators/${encodeURIComponent(
    login,
  )}/permission`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "polyfills-checkchange",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        error: `HTTP ${response.status} ${response.statusText}`,
        permission: null,
      };
    }

    const body = await response.json();
    return { error: null, permission: body.permission ?? null };
  } catch (error) {
    return { error: error.message || String(error), permission: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

function runBeachballCheck(passThroughArgs) {
  const beachballBin = join(
    repoRoot,
    "node_modules",
    "beachball",
    "bin",
    "beachball.js",
  );

  if (!existsSync(beachballBin)) {
    console.error(
      "[checkchange] Beachball is not installed. Run `npm ci` before `npm run checkchange`.",
    );
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [
      beachballBin,
      "check",
      "--changehint",
      "Run 'npm run change' to generate a change file",
      ...passThroughArgs,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error("[checkchange] Failed to execute beachball:", result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

function logBypassBanner(branch, actor, permission) {
  console.log("");
  console.log("================================================================");
  console.log("[checkchange] BYPASS: skipping `beachball check` for this run.");
  console.log("----------------------------------------------------------------");
  console.log(`  branch : ${branch.value} (source: ${branch.source})`);
  console.log(`  actor  : ${actor.value} (source: ${actor.source})`);
  console.log(`  role   : ${permission} (source: GitHub API ${repo})`);
  console.log("");
  console.log("  Reason: publish branch and actor has repository admin role.");
  console.log("================================================================");
  console.log("");
}

async function main() {
  const passThroughArgs = process.argv.slice(2);
  const branch = getBranchName();

  if (!publishBranchPattern.test(branch.value)) {
    runBeachballCheck(passThroughArgs);
    return;
  }

  const actor = getActorLogin();
  if (!actor.value) {
    console.warn(
      "[checkchange] Publish branch detected, but actor could not be determined. Falling through to `beachball check`.",
    );
    runBeachballCheck(passThroughArgs);
    return;
  }

  const token = getToken();
  if (!token.value) {
    console.warn(
      "[checkchange] Publish branch detected, but no GitHub token is available. Falling through to `beachball check`.",
    );
    runBeachballCheck(passThroughArgs);
    return;
  }

  const { error, permission } = await fetchPermission(actor.value, token.value);
  if (error) {
    console.warn(
      `[checkchange] Could not verify '${actor.value}' role on ${repo} (${error}; token source: ${token.source}). Falling through to \`beachball check\`.`,
    );
    runBeachballCheck(passThroughArgs);
    return;
  }

  if (permission !== requiredRole) {
    console.log(
      `[checkchange] Actor '${actor.value}' has role '${permission ?? "none"}' on ${repo}; '${requiredRole}' is required. Falling through to \`beachball check\`.`,
    );
    runBeachballCheck(passThroughArgs);
    return;
  }

  logBypassBanner(branch, actor, permission);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch(error => {
    console.error("[checkchange] Unexpected error:", error);
    process.exit(1);
  });
}

export {
  fetchPermission,
  getActorLogin,
  getBranchName,
  getToken,
  publishBranchPattern,
};
