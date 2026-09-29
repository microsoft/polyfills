/**
 * WPT vendoring script — fetches the css-gaps WPTs from the upstream
 * web-platform-tests repository via sparse git clone.
 *
 * Usage: npx tsx wpt-runner/vendor.ts
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WPT_REPO = "https://github.com/web-platform-tests/wpt.git";
const LOCAL_WPT = resolve(__dirname, "wpt");

const SPARSE_PATHS = [
  "css/css-gaps",
  "css/support",
  "css/reference",
  "resources",
];

function run(cmd: string, cwd?: string) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

console.log("Vendoring WPT files from upstream...");
console.log(`  Repo: ${WPT_REPO}`);
console.log(`  Target: ${LOCAL_WPT}`);

// Clean previous checkout
if (existsSync(LOCAL_WPT)) {
  console.log("  Removing previous vendor directory...");
  rmSync(LOCAL_WPT, { recursive: true, force: true });
}

// Sparse clone: only download the directories we need
mkdirSync(LOCAL_WPT, { recursive: true });
run("git init", LOCAL_WPT);
run(`git remote add origin ${WPT_REPO}`, LOCAL_WPT);
run("git config core.sparseCheckout true", LOCAL_WPT);

// Write sparse-checkout patterns
const sparseFile = join(LOCAL_WPT, ".git", "info", "sparse-checkout");
mkdirSync(dirname(sparseFile), { recursive: true });
writeFileSync(sparseFile, `${SPARSE_PATHS.join("\n")}\n`);

// Fetch only the latest commit, only the needed blobs
run("git pull --depth 1 origin master", LOCAL_WPT);

console.log("  Sparse checkout complete.");

// Create a minimal testharnessreport.js that works standalone
const reportJs = `
// Minimal testharnessreport.js for standalone WPT execution.
// The real one sends results to a harness; we just let testharness.js
// render results into the page.
(function() {
  setup({ explicit_done: false, explicit_timeout: false });
})();
`;
const reportPath = join(LOCAL_WPT, "resources", "testharnessreport.js");
writeFileSync(reportPath, reportJs);
console.log("  Wrote minimal testharnessreport.js");

console.log("Done. WPT files are in:", LOCAL_WPT);
