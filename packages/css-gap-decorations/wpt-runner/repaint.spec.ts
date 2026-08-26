/**
 * Repaint behavior tests — verify the polyfill repaints decorations when
 * a child's placement-affecting attributes change after the initial paint.
 *
 *  These tests fill a gap in WPT coverage. The css-gaps suite does
 * include repaint reftests, but against the polyfill they can pass purely via
 * async-init timing (the polyfill happens to (re)run after the mutation)
 * without proving that the mutation itself triggered the repaint. These tests
 * close that gap by explicitly waiting for the first paint, mutating a child,
 * and asserting a *second* paint occurred.
 *
 * These live here rather than in the shared WPT suite only because the
 * detection mechanism is polyfill-specific (it inspects the polyfill's internal
 * overlay DOM via the sentinel below). A portable WPT would need an
 * engine-agnostic way to prove the mutation triggered a re-render; contributing
 * such a test upstream would benefit native engines too.
 *
 * Repaint detection: after the first paint we append a uniquely-tagged
 * "sentinel" div to the overlay. paintSegments() rebuilds the overlay's
 * children (reusing/trimming them), so a repaint removes the sentinel.
 * Checking for the sentinel's absence detects a repaint independent of
 * whether the resulting decoration geometry changed.
 *
 * Usage: npx playwright test --config wpt-runner/playwright.config.ts
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FN_BUILD = resolve(__dirname, "..", "dist", "css-gap-decorations-fn.js");

const SENTINEL = "data-repaint-sentinel";

/**
 * Load the polyfill (function build) into the page and run it against the
 * given HTML body. Resolves once invoked. Returns false if the polyfill
 * no-opped due to native support.
 */
async function setupPolyfill(page: Page, bodyHtml: string): Promise<boolean> {
  await page.setContent(bodyHtml);
  const fnSource = readFileSync(FN_BUILD, "utf-8");
  return page.evaluate(async (src) => {
    const blob = new Blob([src], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const mod = await import(url);
    await mod.default();
    return !(
      typeof CSS !== "undefined" &&
      CSS.supports &&
      CSS.supports("column-rule-break", "intersection")
    );
  }, fnSource);
}

/** Wait until the polyfill overlay exists for the selector. */
async function waitForOverlay(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((sel) => {
    const c = document.querySelector(sel);
    const root = (c as HTMLElement)?.shadowRoot ?? c;
    return !!root?.querySelector("[data-gap-decorations-polyfill]");
  }, selector);
}

/** Append a sentinel div to the overlay so a later repaint can be detected. */
async function addSentinel(page: Page, selector: string): Promise<void> {
  await page.evaluate(
    ([sel, attr]) => {
      const c = document.querySelector(sel);
      const root = (c as HTMLElement)?.shadowRoot ?? c;
      const overlay = root?.querySelector("[data-gap-decorations-polyfill]");
      if (overlay) {
        const sentinel = document.createElement("div");
        sentinel.setAttribute(attr, "");
        overlay.appendChild(sentinel);
      }
    },
    [selector, SENTINEL] as const,
  );
}

/** True if the sentinel is still present (i.e. no repaint occurred). */
async function sentinelPresent(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    ([sel, attr]) => {
      const c = document.querySelector(sel);
      const root = (c as HTMLElement)?.shadowRoot ?? c;
      const overlay = root?.querySelector("[data-gap-decorations-polyfill]");
      return !!overlay?.querySelector(`[${attr}]`);
    },
    [selector, SENTINEL] as const,
  );
}

test.describe("repaint on child mutation", () => {
  test("repaints when a grid item span changes", async ({ page }) => {
    const active = await setupPolyfill(
      page,
      `<style>
        .grid-container {
          display: grid;
          grid-template: repeat(2, 50px) / repeat(2, 50px);
          gap: 20px;
          column-rule: 20px solid green;
          row-rule: 20px solid green;
          rule-break: intersection;
          rule-visibility-items: around;
          width: 140px;
        }
        .grid-item { background: green; }
        #spanning-item { grid-column: span 2; }
      </style>
      <div class="grid-container">
        <div id="spanning-item" class="grid-item"></div>
      </div>`,
    );
    test.skip(!active, "Native gap decorations supported; polyfill no-op");

    await waitForOverlay(page, ".grid-container");
    await addSentinel(page, ".grid-container");

    await page.evaluate(() => {
      const item = document.getElementById("spanning-item");
      if (item) {
        item.style.gridColumn = "span 1";
      }
    });
    await page.waitForTimeout(300);

    expect(await sentinelPresent(page, ".grid-container")).toBe(false);
  });

  test("repaints when a grid item placement (grid-column) changes", async ({
    page,
  }) => {
    const active = await setupPolyfill(
      page,
      `<style>
        .grid-container {
          display: grid;
          grid-template: 50px / repeat(3, 50px);
          gap: 20px;
          column-rule: 20px solid green;
          rule-visibility-items: between;
          width: 230px;
        }
        .grid-item { background: green; }
      </style>
      <div class="grid-container">
        <div class="grid-item" style="grid-column: 1"></div>
        <div class="grid-item" id="mover" style="grid-column: 2"></div>
      </div>`,
    );
    test.skip(!active, "Native gap decorations supported; polyfill no-op");

    await waitForOverlay(page, ".grid-container");
    await addSentinel(page, ".grid-container");

    await page.evaluate(() => {
      const item = document.getElementById("mover");
      if (item) {
        item.style.gridColumn = "3";
      }
    });
    await page.waitForTimeout(300);

    expect(await sentinelPresent(page, ".grid-container")).toBe(false);
  });

  test("repaints when a grid item is removed (childList control)", async ({
    page,
  }) => {
    const active = await setupPolyfill(
      page,
      `<style>
        .grid-container {
          display: grid;
          grid-template: 50px / repeat(2, 50px);
          gap: 20px;
          column-rule: 20px solid green;
          rule-visibility-items: between;
          width: 140px;
        }
        .grid-item { background: green; }
      </style>
      <div class="grid-container">
        <div class="grid-item" id="a" style="grid-column: 1"></div>
        <div class="grid-item" id="b" style="grid-column: 2"></div>
      </div>`,
    );
    test.skip(!active, "Native gap decorations supported; polyfill no-op");

    await waitForOverlay(page, ".grid-container");
    await addSentinel(page, ".grid-container");

    await page.evaluate(() => {
      document.getElementById("b")?.remove();
    });
    await page.waitForTimeout(300);

    // childList is observed, so this should already repaint — acts as a
    // control confirming the sentinel mechanism detects real repaints.
    expect(await sentinelPresent(page, ".grid-container")).toBe(false);
  });
});
