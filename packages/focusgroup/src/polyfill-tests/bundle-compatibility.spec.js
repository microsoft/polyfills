// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("legacy observer protocol cannot drain current author records", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed" data-testid="owner">
      <div tabindex="0" data-testid="one">One</div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>`,
  );
  await page.getByTestId("two").focus();
  await page.evaluate(() => {
    const legacy = new MutationObserver(() => {});
    legacy.observe(document.body, { attributes: true, subtree: true });
    const state = globalThis.__FOCUSGROUP_POLYFILL__;
    state.o.add(legacy);
    document.querySelector('[data-testid="one"]').hidden = true;
    document.querySelector('[data-testid="two"]').focus();
    for (const observer of state.o) {
      observer.takeRecords();
    }
    legacy.disconnect();
    state.o.delete(legacy);
  });
  await expect(page.getByTestId("one")).not.toHaveAttribute("data-fg-item");
});

for (const order of ["legacy-first", "current-first"]) {
  for (const nested of [false, true]) {
    test(`${order}, nested=${nested}: actual legacy and current bundles coexist`, async ({
      page,
    }, { project }) => {
      test.skip(
        !process.env.FOCUSGROUP_LEGACY_BUILD,
        "Set FOCUSGROUP_LEGACY_BUILD to a pre-provenance build directory",
      );
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const file = project.name.endsWith("Shadowless")
        ? "index-shadowless.min.mjs"
        : "index.min.mjs";
      await page.route("**/legacy-focusgroup.mjs", async (route) => {
        await route.fulfill({
          contentType: "text/javascript",
          body: await readFile(join(process.env.FOCUSGROUP_LEGACY_BUILD, file)),
        });
      });
      await page.goto("/test.html");
      const legacy = `<div data-testid="legacy">
        <button data-testid="legacy-one">One</button>
        <button data-testid="legacy-two">Two</button>
      </div>`;
      await page.setContent(`
      ${legacy}
      <div data-testid="current">
        <div tabindex="0" data-testid="current-one">One
          <button focusgroup="none">Action</button>
        </div>
        <div tabindex="0" data-testid="current-two">Two</div>
      </div>`);
      await page.evaluate(
        async ({ file, order, nested }) => {
          const versions =
            order === "legacy-first"
              ? ["legacy", "current"]
              : ["current", "legacy"];
          for (const version of versions) {
            const { polyfill } = await import(
              version === "legacy" ? "/legacy-focusgroup.mjs" : `/build/${file}`
            );
            const owner = document.querySelector(`[data-testid="${version}"]`);
            owner.setAttribute(
              "focusgroup",
              version === "legacy" ? "toolbar" : "feed",
            );
            if (nested && version === "legacy") {
              document
                .querySelector('[data-testid="current-one"]')
                .append(owner);
            }
            polyfill(owner);
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        },
        { file, order, nested },
      );
      await page.getByTestId("legacy-one").focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByTestId("legacy-two")).toBeFocused();
      await page.getByTestId("current-one").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("current-two")).toBeFocused();
      await page.evaluate(() => {
        document
          .querySelector('[data-testid="current"]')
          .insertAdjacentHTML(
            "beforeend",
            '<div tabindex="0" data-testid="added">Added</div>',
          );
        document.querySelector('[data-testid="legacy-one"]').focus();
      });
      await expect(page.getByTestId("added")).toHaveAttribute("data-fg-item");
      expect(errors).toEqual([]);
    });
  }
}
