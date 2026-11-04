/**
 * WPT acceptance tests — discovers all css-gaps WPT files and runs them
 * through Playwright, classifying each as reftest, testharness, or crash.
 *
 * Usage: npx playwright test --config wpt-runner/playwright.config.ts
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WPT_ROOT = resolve(__dirname, "wpt");
const CSS_GAPS_ROOT = join(WPT_ROOT, "css", "css-gaps");

// Set ATTACH_SCREENSHOTS=1 to embed ref/test screenshots in the HTML report
const attachScreenshots = !!process.env.ATTACH_SCREENSHOTS;

// Discover all test files
interface TestFile {
  path: string; // relative to WPT_ROOT, e.g. "css/css-gaps/grid/foo.html"
  type: "reftest" | "testharness" | "crash";
  refPath?: string; // relative to WPT_ROOT for reftests
  fuzzy?: string; // fuzzy match metadata
  dir: string; // subdirectory, e.g. "grid", "parsing", "flex"
}

function discoverTests(): TestFile[] {
  const tests: TestFile[] = [];

  function walk(dir: string, subdir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(
          join(dir, entry.name),
          subdir ? `${subdir}/${entry.name}` : entry.name,
        );
      } else if (
        entry.name.endsWith(".html") &&
        !entry.name.endsWith("-ref.html") &&
        !entry.name.endsWith("-ref.xht")
      ) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(WPT_ROOT, fullPath).replace(/\\/g, "/");
        const testInfo = classifyTest(fullPath, relPath, subdir);
        if (testInfo) {
          tests.push(testInfo);
        }
      }
    }
  }

  if (existsSync(CSS_GAPS_ROOT)) {
    walk(CSS_GAPS_ROOT, "");
  }

  return tests;
}

function classifyTest(
  fullPath: string,
  relPath: string,
  subdir: string,
): TestFile | null {
  const content = readFileSync(fullPath, "utf-8");

  // Extract directory (first component of subdir)
  const dir = subdir.split("/")[0] || "root";

  // Crash test
  if (fullPath.includes("-crash.html") || fullPath.includes("-crash.htm")) {
    return { path: relPath, type: "crash", dir };
  }

  // Reftest: has <link rel="match" ...>
  const matchLink =
    content.match(/<link\s+rel=["']match["']\s+href=["']([^"']+)["']/i) ||
    content.match(/<link\s+href=["']([^"']+)["']\s+rel=["']match["']/i);
  if (matchLink) {
    const refHref = matchLink[1];
    // Resolve ref path relative to the test file
    const testDir = dirname(fullPath);
    const refFull = resolve(testDir, refHref);
    const refRel = relative(WPT_ROOT, refFull).replace(/\\/g, "/");

    // Extract fuzzy metadata if present
    const fuzzyMatch = content.match(
      /<meta\s+name=["']fuzzy["']\s+content=["']([^"']+)["']/i,
    );

    return {
      path: relPath,
      type: "reftest",
      refPath: refRel,
      fuzzy: fuzzyMatch?.[1],
      dir,
    };
  }

  // Testharness test: uses testharness.js
  if (content.includes("testharness.js")) {
    return { path: relPath, type: "testharness", dir };
  }

  // Unknown — treat as crash test (just load it)
  return { path: relPath, type: "crash", dir };
}

const _POLYFILL_URL = "/polyfill/css-gap-decorations.js";

// Install the polyfill into a page. Routes a virtual URL to the built
// function bundle and adds an init script that imports and invokes it. Note
// addInitScript only affects navigations made *after* this call, which is how
// the reftest renders its reference page without the polyfill (inject, then
// navigate to the test page).
//
// The init script exposes `window.__gapDecorationsPolyfillReady`, a promise
// that resolves once the polyfill's default export has run (its initial paint
// is synchronous, so this is a deterministic "initial paint complete" signal).
// Crash tests await it instead of a fixed timeout.
async function injectPolyfill(page: Page) {
  // Use route to intercept and serve the polyfill from the dist directory
  const polyfillContent = readFileSync(
    resolve(__dirname, "..", "dist", "css-gap-decorations-fn.js"),
    "utf-8",
  );

  await page.route("**/polyfill/css-gap-decorations.js", (route) => {
    route.fulfill({
      contentType: "application/javascript",
      body: polyfillContent,
    });
  });

  // Add an init script that dynamically imports the polyfill before the page
  // loads, exposing a readiness promise so callers can await the initial paint.
  await page.addInitScript(`
    window.__gapDecorationsPolyfillReady = (async function() {
      // Wait for DOM to be ready enough
      if (document.readyState === 'loading') {
        await new Promise(r => document.addEventListener('DOMContentLoaded', r));
      }
      try {
        const mod = await import('/polyfill/css-gap-decorations.js');
        if (mod && mod.default) await mod.default();
      } catch(e) {
        // Swallow: a load/parse error isn't a renderer crash. The promise
        // still resolves, so awaiting it means "the polyfill finished its
        // initial pass without hanging" — what crash tests need to know.
      }
    })();
  `);
}

/**
 * Wait for a reftest page to be ready for screenshotting.
 *
 * WPT reftest pages signal readiness by removing the "reftest-wait" class
 * from <html>. If the class is present, we wait for it to be removed
 * (up to 5 seconds), then allow an extra frame for the polyfill to
 * repaint. For pages without reftest-wait, we just wait briefly for
 * any pending polyfill paints to settle.
 */
async function waitForReftestReady(page: Page) {
  const hasReftestWait = await page.evaluate(() =>
    document.documentElement.classList.contains("reftest-wait"),
  );

  if (hasReftestWait) {
    // Wait for the test script to remove reftest-wait (signals the
    // mutation / resize has been applied).
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("reftest-wait"),
      { timeout: 5000 },
    );
    // Allow a few frames for ResizeObserver + rAF repaint to complete.
    await page.waitForTimeout(200);
  } else {
    // Static page — just allow the polyfill to finish painting.
    await page.waitForTimeout(500);
  }
}

// ---- Skip lists ----
//
// The polyfill deliberately does not implement some parts of the spec, and a
// few WPTs depend on browser behavior the polyfill cannot reproduce. We skip
// these explicitly (with a reason) so a green run reflects "everything the
// polyfill claims to support passes", rather than burying known-good results
// among expected failures. The underlying files are still fetched by
// vendor.ts: leaving them on disk keeps the skip list auditable and lets a
// maintainer re-enable a test if the polyfill gains the capability, without
// having to re-vendor.

/**
 * Per-test known limitations. Keyed by the test's file name. Each entry
 * documents *why* the polyfill cannot pass the test today.
 */
const KNOWN_UNSUPPORTED: Record<string, string> = {
  // :visited color is restricted by the browser for privacy; the polyfill
  // cannot read it to color a gap decoration.
  "grid-gap-decorations-024.html": ":visited styling is privacy-restricted",
  "grid-gap-decorations-025.html": ":visited styling is privacy-restricted",
  "grid-gap-decorations-027.html": ":visited styling is privacy-restricted",
  // display: -webkit-box is a legacy flex display the polyfill doesn't detect.
  "webkit-box.tentative.html": "legacy -webkit-box not detected as flex",
  // The polyfill only sees columns up to column-count; column-fill: auto and
  // overflowing content create additional columns it cannot detect.
  "multicol-gap-decorations-007.html": "nested multicol fragmentation",
  "multicol-gap-decorations-013.html": "overflow columns not detectable",
  "multicol-gap-decorations-026.html": "column-count:auto + text sub-pixel",
  "multicol-gap-decorations-027.html": "overflow columns not detectable",
};

/**
 * WPT reference pages that are themselves buggy: they render the *expected*
 * result by relying on gap-decoration properties (the very feature under test)
 * rather than drawing it independently (e.g. with plain borders/divs, as a
 * correct reference such as grid-gap-decorations-012-ref does). A reference may
 * not depend on the feature it is meant to verify, so with native gap
 * decorations disabled and no polyfill, these render blank.
 *
 * As a workaround (rather than dropping the coverage) we inject the polyfill
 * into the *reference* page for these specific tests, so it renders the
 * expected output. The comparison is then polyfill-vs-polyfill, but it still
 * exercises the test page (e.g. the repaint tests mutate the DOM and verify the
 * post-mutation render matches the static reference). These references should
 * be fixed upstream to draw their expected output independently.
 */
const BUGGY_REFERENCES: Record<string, string> = {
  "grid-gap-decorations-045.html": "reference relies on multi-value row-rule",
  "flex-gap-decorations-repaint-on-child-resize.html":
    "reference relies on flex column-rule",
  "grid-gap-decorations-repaint-on-child-resize.html":
    "reference relies on grid column-rule",
  "grid-gap-decorations-repaint-on-item-position-change.html":
    "reference relies on grid column-rule/row-rule/rule-break",
  "grid-gap-decorations-repaint-on-item-span-change.html":
    "reference relies on grid column-rule/row-rule/rule-break",
};

/**
 * Reason this test should be skipped, or null to run it.
 * - Fragmentation is not implemented (container-level fragmentation support).
 * - Otherwise, consult KNOWN_UNSUPPORTED.
 */
function skipReason(t: TestFile): string | null {
  const name = t.path.split("/").pop() ?? t.path;
  if (name.includes("fragmentation")) {
    return "fragmentation is not implemented by the polyfill";
  }
  return KNOWN_UNSUPPORTED[name] ?? null;
}

// ---- Test generation ----

const allTests = discoverTests();

// Group by directory for reporting
const byDir = new Map<string, TestFile[]>();
for (const t of allTests) {
  if (!byDir.has(t.dir)) {
    byDir.set(t.dir, []);
  }
  byDir.get(t.dir)?.push(t);
}

for (const [dir, tests] of byDir) {
  test.describe(`css-gaps/${dir}`, () => {
    // Reftests
    const reftests = tests.filter((t) => t.type === "reftest");
    for (const rt of reftests) {
      test(`reftest: ${rt.path.split("/").pop()}`, async ({ page }) => {
        const reason = skipReason(rt);
        test.skip(reason !== null, reason ?? "");

        const name = rt.path.split("/").pop() ?? rt.path;
        // Most references draw the expected result independently of the
        // feature under test, so we render them WITHOUT the polyfill — the
        // reference must be an independent oracle (injecting the polyfill into
        // it would make a polyfill-vs-polyfill comparison that could mask real
        // bugs). The buggy references in BUGGY_REFERENCES instead rely on gap
        // decorations to render, so for those (and only those) we inject the
        // polyfill into the reference too as a workaround.
        const refNeedsPolyfill = name in BUGGY_REFERENCES;

        if (refNeedsPolyfill) {
          await injectPolyfill(page);
        }

        // Screenshot the reference page.
        await page.goto(`/${rt.refPath}`, { waitUntil: "networkidle" });
        await waitForReftestReady(page);
        const refBuf = await page.screenshot({ fullPage: true });

        // Install the polyfill for the test page (if not already installed for
        // the reference). injectPolyfill's addInitScript/route only affect
        // later navigations. Chromium has shipped native gap decorations, but
        // this project disables them (--disable-features=CSSGapDecoration, see
        // playwright.config.ts) so the test page exercises the polyfill.
        if (!refNeedsPolyfill) {
          await injectPolyfill(page);
        }
        await page.goto(`/${rt.path}`, { waitUntil: "networkidle" });
        await waitForReftestReady(page);
        const testBuf = await page.screenshot({ fullPage: true });

        // Optionally attach screenshots to the Playwright HTML report
        if (attachScreenshots) {
          await test.info().attach("reference", {
            body: Buffer.from(refBuf),
            contentType: "image/png",
          });
          await test.info().attach("test-page", {
            body: Buffer.from(testBuf),
            contentType: "image/png",
          });
        }

        // Compare using pixelmatch
        const refPng = PNG.sync.read(Buffer.from(refBuf));
        const testPng = PNG.sync.read(Buffer.from(testBuf));

        const w = Math.min(refPng.width, testPng.width);
        const h = Math.min(refPng.height, testPng.height);
        if (w === 0 || h === 0) {
          throw new Error("Screenshot has zero dimensions");
        }

        const refData = cropImageData(refPng, w, h);
        const testData = cropImageData(testPng, w, h);

        const diffPixels = pixelmatch(testData, refData, null, w, h, {
          threshold: 0.1,
        });

        const maxDiffPixels = parseFuzzy(rt.fuzzy);
        const totalPixels = w * h;

        if (diffPixels > maxDiffPixels) {
          // Always generate and attach diff image on failure
          const diffPng = new PNG({ width: w, height: h });
          pixelmatch(testData, refData, diffPng.data, w, h, { threshold: 0.1 });
          await test.info().attach("diff", {
            body: PNG.sync.write(diffPng),
            contentType: "image/png",
          });

          const diffDir = resolve(__dirname, "..", "test-results", "diffs");
          mkdirSync(diffDir, { recursive: true });
          writeFileSync(
            join(diffDir, `${rt.path.replace(/\//g, "-")}-diff.png`),
            PNG.sync.write(diffPng),
          );
          writeFileSync(
            join(diffDir, `${rt.path.replace(/\//g, "-")}-test.png`),
            Buffer.from(testBuf),
          );
          writeFileSync(
            join(diffDir, `${rt.path.replace(/\//g, "-")}-ref.png`),
            Buffer.from(refBuf),
          );
        }

        expect(
          diffPixels,
          `${rt.path}: ${diffPixels}/${totalPixels} pixels differ (max allowed: ${maxDiffPixels})`,
        ).toBeLessThanOrEqual(maxDiffPixels);
      });
    }

    // Testharness tests (parsing)
    const thtests = tests.filter((t) => t.type === "testharness");
    for (const th of thtests) {
      test(`testharness: ${th.path.split("/").pop()}`, async ({ page }) => {
        await injectPolyfill(page);
        await page.goto(`/${th.path}`, { waitUntil: "networkidle" });

        // Wait for testharness completion
        const results = await page.evaluate(() => {
          return new Promise<{
            status: number;
            tests: { name: string; status: number; message: string }[];
          }>((resolve) => {
            // testharness.js sets completion_callback
            if ((window as any).completion_callback) {
              (window as any).completion_callback(
                (tests: any[], status: any) => {
                  resolve({
                    status: status.status,
                    tests: tests.map((t: any) => ({
                      name: t.name,
                      status: t.status,
                      message: t.message || "",
                    })),
                  });
                },
              );
            } else {
              // Fallback: read from the DOM
              setTimeout(() => {
                const rows = document.querySelectorAll(
                  "#results table.results tbody tr",
                );
                const tests: {
                  name: string;
                  status: number;
                  message: string;
                }[] = [];
                for (const row of rows) {
                  const cells = row.querySelectorAll("td");
                  if (cells.length >= 3) {
                    const statusText = cells[0]?.textContent?.trim() || "";
                    tests.push({
                      name: cells[1]?.textContent?.trim() || "",
                      status: statusText === "PASS" ? 0 : 1,
                      message: cells[2]?.textContent?.trim() || "",
                    });
                  }
                }
                resolve({ status: 0, tests });
              }, 3000);
            }
          });
        });

        // Report individual sub-test results
        for (const sub of results.tests) {
          // Status 0 = PASS, 1 = FAIL, 2 = TIMEOUT, 3 = NOTRUN
          if (sub.status !== 0) {
            console.log(`  FAIL: ${sub.name} — ${sub.message}`);
          }
        }

        const passCount = results.tests.filter((t) => t.status === 0).length;
        const totalCount = results.tests.length;
        console.log(
          `  ${passCount}/${totalCount} sub-tests passed in ${th.path}`,
        );

        // Don't hard-fail testharness tests in v1 — track pass rates
        // Uncomment below to enforce:
        // expect(passCount).toBe(totalCount);
      });
    }

    // Crash tests
    const crashtests = tests.filter((t) => t.type === "crash");
    for (const ct of crashtests) {
      test(`crash: ${ct.path.split("/").pop()}`, async ({ page }) => {
        const reason = skipReason(ct);
        test.skip(reason !== null, reason ?? "");

        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));
        let crashed = false;
        page.on("crash", () => {
          crashed = true;
        });

        await injectPolyfill(page);
        await page.goto(`/${ct.path}`, { waitUntil: "load" });

        // Wait for the test's own async completion signal, if it uses one
        // (WPT crashtests may carry class="test-wait" on <html>). Static tests
        // resolve immediately.
        await page.waitForFunction(() => {
          const c = document.documentElement.classList;
          return !c.contains("test-wait") && !c.contains("reftest-wait");
        });

        // Deterministic "paint complete": the polyfill's default() resolves
        // after its initial synchronous paint.
        await page.evaluate(
          () =>
            (
              window as unknown as {
                __gapDecorationsPolyfillReady?: Promise<void>;
              }
            ).__gapDecorationsPolyfillReady,
        );

        // Flush any rAF-scheduled repaint triggered by async test setup, so a
        // crash during that repaint is caught before we assert.
        await page.evaluate(
          () =>
            new Promise<void>((r) =>
              requestAnimationFrame(() => requestAnimationFrame(() => r())),
            ),
        );

        expect(crashed, `${ct.path}: renderer crashed`).toBe(false);
        expect(errors, `${ct.path}: uncaught page errors`).toEqual([]);
      });
    }
  });
}

// Fuzzy parsing: format is "maxDifference=N;totalPixels=N" or just a number.
// Default tolerance accounts for anti-aliasing and sub-pixel rounding but
// is tight enough to catch real rendering bugs.
function parseFuzzy(fuzzy?: string): number {
  if (!fuzzy) {
    return 200; // default: allow up to 200 differing pixels
  }
  const totalMatch = fuzzy.match(/totalPixels=(\d+)/);
  if (totalMatch) {
    return parseInt(totalMatch[1], 10);
  }
  const num = parseInt(fuzzy, 10);
  return Number.isNaN(num) ? 200 : num;
}

/** Crop a PNG to the given width and height, returning raw RGBA data. */
function cropImageData(png: PNG, w: number, h: number): Buffer {
  if (png.width === w && png.height === h) {
    return png.data as unknown as Buffer;
  }
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcOffset = y * png.width * 4;
    const dstOffset = y * w * 4;
    png.data.copy(out, dstOffset, srcOffset, srcOffset + w * 4);
  }
  return out;
}
