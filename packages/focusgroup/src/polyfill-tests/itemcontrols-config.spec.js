// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

test("suppressed authored tabindex parsing matches the browser", async ({
  page,
}, { project }) => {
  await setupPage(page, project, "<main></main>");
  expect(
    await page.evaluate(async () => {
      const { isKeyboardFocusable } = await import("/build/utils.mjs");
      const mismatches = [];
      for (const tag of ["a", "button", "div"]) {
        for (const value of [
          null,
          "",
          " ",
          "invalid",
          "1.5",
          ".5",
          "-.5",
          "-1.5",
          "+2tail",
          "0x10",
          "1e2",
          "\t-1",
          "2147483648",
        ]) {
          const element = document.createElement(tag);
          if (tag === "a") {
            element.setAttribute("href", "#");
          }
          if (value !== null) {
            element.setAttribute("tabindex", value);
          }
          document.body.append(element);
          const native = element.tabIndex >= 0;
          element.tabIndex = -1;
          const restored = isKeyboardFocusable(element, undefined, true, value);
          if (restored !== native) {
            mismatches.push({ tag, value, native, restored });
          }
          element.remove();
        }
      }
      return mismatches;
    }),
  ).toEqual([]);
});

test("itemcontrols defaults belong to behavior config, not behavior tokens", async ({
  page,
}, { project }) => {
  await setupPage(page, project, "<main></main>");
  expect(
    await page.evaluate(async () => {
      const { BehaviorMap, BehaviorToken, ModifierToken } = await import(
        "/build/constants.mjs"
      );
      return {
        feed: BehaviorMap.feed.itemControls,
        grid: BehaviorMap.grid.itemControls,
        toolbar: BehaviorMap.toolbar.itemControls,
        modifier: ModifierToken.ITEMCONTROLS,
        modifierIsBehavior:
          Object.values(BehaviorToken).includes("itemcontrols") ||
          Object.values(BehaviorToken).includes("noitemcontrols"),
      };
    }),
  ).toEqual({
    feed: true,
    grid: true,
    toolbar: false,
    modifier: "itemcontrols",
    modifierIsBehavior: false,
  });
});

test("demo exposes opt-in toolbar and opt-out feed examples", async ({ page }, {
  project,
}) => {
  await page.goto("/");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const toolbar = page.locator('[focusgroup="toolbar itemcontrols"]');
  const tools = toolbar.locator(":scope > div");
  await tools.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tools.last()).toBeFocused();
  await pressTab(page, project);
  await expect(
    toolbar.getByRole("button", { name: "Align left", exact: true }),
  ).toBeFocused();
  const feed = page.locator('[focusgroup="feed noitemcontrols"]');
  await feed.locator(":scope > div").first().focus();
  await pressTab(page, project);
  await expect(
    feed.getByRole("button", { name: "Like first", exact: true }),
  ).toBeFocused();
});

test("model-backed item controls need no DOM discovery", async ({ page }, {
  project,
}) => {
  await page.goto("/test.html");
  await page.setContent(`
    <div id="owner"><div id="one" tabindex="0">One<button id="action">Action</button></div>
    <div id="two" tabindex="0">Two</div></div>`);
  await page.evaluate(
    async (specifier) => {
      const { FocusGroup } = await import(specifier);
      const [owner, one, two, action] = ["owner", "one", "two", "action"].map(
        (id) => document.getElementById(id),
      );
      const items = [one, two];
      const original = document.createTreeWalker;
      document.createTreeWalker = () => {
        throw new Error("Model-backed groups must not walk the DOM");
      };
      try {
        new FocusGroup(
          owner,
          {
            items: () => items.map((element) => ({ element })),
            first: () => one,
            last: () => two,
            next: (item) => (item === one ? two : null),
            previous: (item) => (item === two ? one : null),
            contains: (element) => items.includes(element),
            controls: {
              items: () => [{ element: action, item: one }],
              itemForNode: (element) => (element === action ? one : null),
            },
          },
          {
            definition: { behavior: "feed", axis: "block", itemcontrols: true },
          },
        );
      } finally {
        document.createTreeWalker = original;
      }
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  await page.locator("#one").focus();
  await pressTab(page, project);
  await expect(page.locator("#action")).toBeFocused();
  await page.locator("#one").focus();
  await pressTab(page, project);
  await expect(page.locator("#action")).toBeFocused();
  await page.locator("#one").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#two")).toBeFocused();
});
