// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";
import { expect, pressTab, routeTestBuild, setupPage } from "./utils.js";

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

for (const order of ["legacy-first", "current-first"]) {
  test(`${order}: inactive current feed preserves legacy nested navigation`, async ({
    page,
  }, { project }) => {
    test.skip(
      !process.env.FOCUSGROUP_LEGACY_BUILD,
      "Requires an actual legacy bundle",
    );
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
      <div data-testid="feed"><div tabindex="0" data-testid="one">One
        <div data-testid="toolbar"><button data-testid="a">A</button><button data-testid="b">B</button></div>
      </div><div tabindex="0" data-testid="two">Two</div></div>
      <button data-testid="after">After</button>`);
    await page.evaluate(
      async ({ file, order }) => {
        Object.defineProperty(document.body, "focusGroup", {
          value: { supports: () => false },
        });
        for (const version of order === "legacy-first"
          ? ["legacy", "current"]
          : ["current", "legacy"]) {
          const { polyfill } = await import(
            version === "legacy" ? "/legacy-focusgroup.mjs" : `/build/${file}`
          );
          const el = document.querySelector(
            `[data-testid="${version === "legacy" ? "toolbar" : "feed"}"]`,
          );
          el.setAttribute(
            "focusgroup",
            version === "legacy" ? "toolbar" : "feed",
          );
          polyfill(el);
          await new Promise(requestAnimationFrame);
        }
        await new Promise(requestAnimationFrame);
      },
      { file, order },
    );
    await page.getByTestId("a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();
    await page.getByTestId("two").focus();
    await page.getByTestId("a").evaluate(async (el) => {
      el.setAttribute("tabindex", "0");
      await new Promise(requestAnimationFrame);
    });
    await page.getByTestId("a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();
  });
}
