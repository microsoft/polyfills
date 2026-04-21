// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACES_DIR = path.join(__dirname, "traces");

test("capture performance traces", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP tracing requires Chromium");
  test.setTimeout(120_000);

  fs.mkdirSync(TRACES_DIR, { recursive: true });

  await page.goto("/bench/bench.html");

  // Start tracing before benchmarks run -- reload to capture from scratch
  const tracePath = path.join(TRACES_DIR, `bench-trace-${Date.now()}.json`);
  await page.tracing.start({
    screenshots: false,
    categories: ["devtools.timeline"],
  });

  await page.reload();
  await page.waitForFunction(() => window.__benchResults, null, {
    timeout: 100_000,
  });

  await page.tracing.stop({ path: tracePath });
  console.log(`\nTrace saved to ${tracePath}`);
  console.log("  Open in https://ui.perfetto.dev or chrome://tracing\n");
});
