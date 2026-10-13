// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";
import { expect, pressTab, routeTestBuild, setupPage } from "./utils.js";

test("the polyfill root is not an owner without a focusgroup attribute", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar"><button>One</button></div>`,
  );
  expect(
    await page.evaluate(() =>
      [...globalThis.__FOCUSGROUP_POLYFILL__.m.keys()].map(
        (el) => el.localName,
      ),
    ),
  ).toEqual(["div"]);
});

for (const order of ["legacy-first", "current-first"]) {
  for (const shadow of [false, true]) {
    test(`${order}: detached current owners are cleaned up with a legacy global observer${shadow ? " @shadow" : ""}`, async ({
      page,
    }, { project }) => {
      test.skip(
        !process.env.FOCUSGROUP_LEGACY_BUILD,
        "Requires actual legacy build",
      );
      await routeTestBuild(page);
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
      await page.setContent(`
      <div id="legacy" focusgroup="toolbar"><button>Legacy</button></div>
      <section id="wrapper">${shadow ? '<template shadowrootmode="open">' : ""}<div id="current" focusgroup="feed">
        <div tabindex="0" data-testid="one">One<button focusgroup="none" data-testid="action">Action</button></div>
        <div tabindex="0" data-testid="two">Two</div>
      </div>${shadow ? "</template>" : ""}</section>`);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const state = await page.evaluate(
        async ({ file, order }) => {
          Object.defineProperty(document.body, "focusGroup", {
            value: { supports: () => false },
          });
          const versions =
            order === "legacy-first"
              ? ["legacy", "current"]
              : ["current", "legacy"];
          let current;
          const wrapper = document.getElementById("wrapper");
          const owner = (wrapper.shadowRoot ?? wrapper).querySelector(
            "#current",
          );
          for (const version of versions) {
            const module = await import(
              version === "legacy" ? "/legacy-focusgroup.mjs" : `/build/${file}`
            );
            module.polyfill(
              version === "current" ? owner : document.getElementById("legacy"),
            );
            if (version === "current") {
              current = module;
            }
            await new Promise(requestAnimationFrame);
          }
          const action = owner.querySelector("button");
          owner.querySelector('[data-testid="two"]').focus();
          document.getElementById("wrapper").remove();
          const detached = document.createDocumentFragment();
          detached.append(owner);
          await new Promise((resolve) => setTimeout(resolve, 0));
          const shared = globalThis.__FOCUSGROUP_POLYFILL__;
          const result = {
            tracked: shared.m.has(owner),
            observers: shared.p.size,
            controls: shared.c.size,
            tabindex: action.getAttribute("tabindex"),
          };
          document.body.append(detached);
          current.polyfill(owner);
          await new Promise(requestAnimationFrame);
          return result;
        },
        { file, order },
      );
      expect(state).toEqual({
        tracked: false,
        observers: 0,
        controls: 0,
        tabindex: null,
      });
      await page.getByTestId("one").focus();
      await pressTab(page, project);
      await expect(page.getByTestId("action")).toBeFocused();
      await page.getByTestId("one").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("two")).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}

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

test("empty authored tabindex is restored after item teardown", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" data-testid="owner"><button tabindex="" data-testid="one">One</button><button tabindex="">Two</button></div>`,
  );
  await page
    .getByTestId("owner")
    .evaluate((el) => el.setAttribute("focusgroup", "none"));
  await expect(page.getByTestId("one")).toHaveAttribute("tabindex", "");
  await page.getByTestId("one").focus();
  await pressTab(page, project);
  await expect(
    page.getByRole("button", { name: "Two", exact: true }),
  ).toBeFocused();
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
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#two")).toBeFocused();
});
