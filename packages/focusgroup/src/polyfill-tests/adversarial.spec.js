// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

const items = `
  <div tabindex="0" data-testid="one">One
    <button focusgroup="none" data-testid="action-one">Action one</button>
  </div>
  <div tabindex="0" data-testid="two">Two
    <button focusgroup="none" data-testid="action-two">Action two</button>
  </div>`;

test("reverse grid entry activates controls before the next Tab", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="grid manual"><div focusgrouprow>${items}</div></div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("after").focus();
  await pressTab(page, project, true);
  await expect(page.getByTestId("one")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("action-one")).toBeFocused();
});

for (const action of ["focus", "click"]) {
  test(`shadow-internal ${action} updates owner controls and memory @shadow`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="feed"><div><template shadowrootmode="open">${items}</template></div></div>
      <button data-testid="after">After</button>`,
    );
    await page.getByTestId("one").focus();
    await page.getByTestId("action-two")[action]();
    await expect(page.getByTestId("action-one")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await expect(page.getByTestId("action-two")).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.getByTestId("after").focus();
    await pressTab(page, project, true);
    await expect(page.getByTestId("two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("action-two")).toBeFocused();
  });
}

for (const late of [false, true]) {
  test(`overlapping observers preserve nested roving tabindex, late=${late}`, async ({
    page,
  }, { project }) => {
    const toolbar = `<div focusgroup="toolbar" data-testid="toolbar">
      <button data-testid="a">A</button><button data-testid="b">B</button></div>`;
    await setupPage(
      page,
      project,
      `<div focusgroup="feed"><div tabindex="0" data-testid="one">One${late ? "" : toolbar}</div>
      <div tabindex="0">Two</div></div><button data-testid="after">After</button>`,
    );
    if (late) {
      await page.getByTestId("one").evaluate(
        async (el, { markup, specifier }) => {
          el.insertAdjacentHTML("beforeend", markup);
          const { polyfill } = await import(specifier);
          polyfill(el);
          await new Promise(requestAnimationFrame);
        },
        {
          markup: toolbar,
          specifier: project.name.endsWith("Shadowless")
            ? "/build/index-shadowless.mjs"
            : "/build/index.mjs",
        },
      );
    }
    await page.getByTestId("b").focus();
    await page.getByTestId("a").evaluate(async (el) => {
      el.setAttribute("tabindex", "0");
      await new Promise(requestAnimationFrame);
    });
    await page.getByTestId("after").focus();
    await page.getByTestId("one").focus();
    await expect(page.getByTestId("a")).toHaveAttribute("tabindex", "-1");
    await expect(page.getByTestId("b")).toHaveAttribute("tabindex", "0");
    await pressTab(page, project);
    await expect(page.getByTestId("b")).toBeFocused();
  });
}

test("new shadow roots reconcile focus and release listeners on teardown @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" data-testid="owner"><div tabindex="0">Initial</div></div>`,
  );
  await page.getByTestId("owner").evaluate(async (el, markup) => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).innerHTML = markup;
    el.replaceChildren(host);
    await new Promise(requestAnimationFrame);
  }, items);
  await page.getByTestId("one").focus();
  await page.getByTestId("action-two").focus();
  await expect(page.getByTestId("action-one")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.getByTestId("action-two")).not.toHaveAttribute(
    "tabindex",
    "-1",
  );
  await page.getByTestId("owner").evaluate(async (el) => {
    const group = globalThis.__FOCUSGROUP_POLYFILL__.m.get(el);
    group.disconnect();
    await new Promise(requestAnimationFrame);
  });
  await page.getByTestId("one").focus();
  await page.getByTestId("action-two").focus();
  await expect(page.getByTestId("action-one")).not.toHaveAttribute("tabindex");
  await expect(page.getByTestId("action-two")).not.toHaveAttribute("tabindex");
});

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
