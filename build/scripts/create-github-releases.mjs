#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";

const artifactDir = "publish_artifacts";
const checkOnly = process.argv.includes("--check-only");

function command(name) {
  return process.platform === "win32" && name === "npm" ? "npm.cmd" : name;
}

function run(file, args, options = {}) {
  return execFileSync(command(file), args, {
    encoding: "utf8",
    ...options,
  });
}

function gitTagExists(tag) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function expandWorkspacePattern(pattern) {
  const segments = pattern.split(/[\\/]+/).filter(Boolean);
  let paths = ["."];

  for (const segment of segments) {
    const nextPaths = [];
    const hasWildcard = segment.includes("*");
    const matcher = hasWildcard
      ? new RegExp(`^${segment.replace(/\*/g, ".*")}$`)
      : null;

    for (const currentPath of paths) {
      if (!existsSync(currentPath)) {
        continue;
      }

      if (!hasWildcard) {
        nextPaths.push(join(currentPath, segment));
        continue;
      }

      for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
        if (entry.isDirectory() && matcher.test(entry.name)) {
          nextPaths.push(join(currentPath, entry.name));
        }
      }
    }

    paths = nextPaths;
  }

  return paths;
}

function listPublishableWorkspaces() {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  const patterns = Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces
    : (rootPackage.workspaces?.packages ?? []);
  const locations = new Set(patterns.flatMap(expandWorkspacePattern));

  return Array.from(locations)
    .map(location => {
      const packagePath = join(location, "package.json");
      if (!existsSync(packagePath)) {
        return null;
      }

      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      if (packageJson.private === true || !packageJson.name || !packageJson.version) {
        return null;
      }

      return {
        location,
        name: packageJson.name,
        tag: `${packageJson.name}_v${packageJson.version}`,
        version: packageJson.version,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function setGitHubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function parsePackOutput(output) {
  const packages = JSON.parse(output);
  if (!Array.isArray(packages) || packages.length === 0 || !packages[0].filename) {
    throw new Error(`Unexpected npm pack output: ${output}`);
  }
  return packages[0].filename;
}

function hasGitHubCliAuth() {
  if (process.env.GITHUB_TOKEN?.trim()) {
    return true;
  }

  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const publishableWorkspaces = listPublishableWorkspaces();
const missingReleases = publishableWorkspaces.filter(({ tag }) => !gitTagExists(tag));

console.log(`Publishable workspaces:    ${publishableWorkspaces.length}`);
console.log(
  `With existing git tag:     ${publishableWorkspaces.length - missingReleases.length}`,
);
console.log(`Missing git tag / release: ${missingReleases.length}`);

if (missingReleases.length > 0) {
  console.log("\nPackages that need a release:");
  for (const { name, version } of missingReleases) {
    console.log(`  - ${name}@${version}`);
  }
}

setGitHubOutput("hasMissingReleases", missingReleases.length > 0 ? "true" : "false");

if (checkOnly || missingReleases.length === 0) {
  process.exit(0);
}

if (!hasGitHubCliAuth()) {
  console.error("GitHub CLI authentication is required to create releases.");
  console.error("In GitHub Actions, set GITHUB_TOKEN to ${{ github.token }}.");
  process.exit(1);
}

rmSync(artifactDir, { force: true, recursive: true });
mkdirSync(artifactDir, { recursive: true });

let created = 0;
let hasErrors = false;

for (const { name, tag, version } of missingReleases) {
  try {
    console.log(`\nPacking ${name}@${version}...`);
    const packOutput = run(
      "npm",
      [
        "pack",
        "--silent",
        "--json",
        `--workspace=${name}`,
        `--pack-destination=${resolve(artifactDir)}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const asset = join(artifactDir, parsePackOutput(packOutput));

    const notes = [
      `Release for \`${name}@${version}\`.`,
      "",
      "Version changes landed through a pull request. The attached npm",
      "tarball will be downloaded and published by the Azure release pipeline.",
    ].join("\n");
    const targetSha = (process.env.GITHUB_SHA || run("git", ["rev-parse", "HEAD"])).trim();

    console.log(`Creating release ${tag} at ${targetSha.slice(0, 7)}...`);
    run(
      "gh",
      [
        "release",
        "create",
        tag,
        asset,
        "--target",
        targetSha,
        "--title",
        `${name}@${version}`,
        "--notes",
        notes,
      ],
      { stdio: "inherit" },
    );
    console.log(`Created release ${tag}`);
    created += 1;
  } catch (error) {
    hasErrors = true;
    console.error(
      `Failed to release ${name}@${version}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

console.log(`\nReleases created: ${created}/${missingReleases.length}`);

if (hasErrors) {
  process.exitCode = 1;
}
