// @ts-check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, "baseline.json");

test("benchmark polyfill scenarios", async ({ page }) => {
  test.setTimeout(120_000);

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("PAGE:", msg.text());
    }
  });
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

  await page.goto("/bench/bench.html");

  // Wait for benchmarks to complete (window.__benchResults is set)
  await page.waitForFunction(() => window.__benchResults, null, {
    timeout: 100_000,
  });

  const results = await page.evaluate(() => window.__benchResults);

  // ---- Print results table ----
  console.log(
    "\n+--------------------------+--------------+-----------+-----------+---------+",
  );
  console.log(
    "| Scenario                 |    ops/sec   |  avg (ms) |  p99 (ms) | samples |",
  );
  console.log(
    "+--------------------------+--------------+-----------+-----------+---------+",
  );
  for (const [name, r] of Object.entries(results)) {
    console.log(
      `| ${name.padEnd(24)} | ${String(r.opsPerSec).padStart(12)} | ${String(r.avgMs).padStart(9)} | ${String(r.p99Ms).padStart(9)} | ${String(r.samples).padStart(7)} |`,
    );
  }
  console.log(
    "+--------------------------+--------------+-----------+-----------+---------+\n",
  );

  // ---- Save baseline if requested (before comparison so it always saves) ----
  if (process.env.BENCH_BASELINE) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Baseline saved to ${BASELINE_PATH}`);
  }

  // ---- Compare against baseline (if it exists and not regenerating) ----
  if (!process.env.BENCH_BASELINE && fs.existsSync(BASELINE_PATH)) {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
    const regressions = [];

    for (const [name, base] of Object.entries(baseline)) {
      const current = results[name];
      if (!current) {
        continue;
      }
      // Allow 30% degradation before flagging as regression
      const threshold = base.opsPerSec * 0.7;
      if (current.opsPerSec < threshold) {
        regressions.push(
          `${name}: ${current.opsPerSec} ops/sec (baseline: ${base.opsPerSec}, threshold: ${Math.round(threshold)})`,
        );
      }
    }

    if (regressions.length > 0) {
      console.error("Performance regressions detected:");
      for (const r of regressions) {
        console.error(`  x ${r}`);
      }
      expect(regressions).toHaveLength(0);
    } else {
      console.log("No performance regressions detected (vs baseline.json)");
    }
  } else if (!process.env.BENCH_BASELINE) {
    console.log("No baseline.json found. Run bench:baseline to create one.");
  }
});
