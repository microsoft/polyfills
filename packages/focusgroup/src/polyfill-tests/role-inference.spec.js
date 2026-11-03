// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("grid role inference preserves button semantics", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="grid manual">
      <div focusgrouprow><button data-testid="button">Action</button><div tabindex="0" data-testid="cell">Cell</div></div>
    </div>`,
  );
  await expect(page.getByTestId("button")).toHaveComputedRole("button");
  await expect(page.getByTestId("button")).not.toHaveAttribute("role");
  await expect(page.getByTestId("cell")).toHaveComputedRole("gridcell");
  // Exercise the shared helper as well as the grid's coordinate decorator.
  await page.getByTestId("button").evaluate(async (el) => {
    const { inferRole } = await import("/build/utils.mjs");
    inferRole(el, "grid", "child");
  });
  await expect(page.getByTestId("button")).not.toHaveAttribute("role");
  await page.getByTestId("button").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("cell")).toBeFocused();
});

test("nested owner role survives parent reconciliation and teardown", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" id="feed">
      <div focusgroup="toolbar" tabindex="0" data-testid="toolbar"><button>A</button></div>
      <article tabindex="0">Two</article>
    </div>`,
  );
  await expect(page.getByTestId("toolbar")).toHaveRole("toolbar");
  await page.evaluate(() => {
    const owner = document.getElementById("feed");
    const feed = globalThis.__FOCUSGROUP_POLYFILL__.m.get(owner);
    feed.update();
    feed.disconnect();
  });
  await expect(page.getByTestId("toolbar")).toHaveRole("toolbar");
});
