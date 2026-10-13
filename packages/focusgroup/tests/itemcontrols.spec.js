// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

// V2 itemcontrols extends WPT focusgroup sequential-navigation coverage.
// These assertions describe focus and accessibility, not polyfill markers.
test("plain Tab reaches item boundaries without the platform control modifier", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div tabindex="0" data-testid="before">Before</div>
    <div focusgroup="feed"><div tabindex="0" data-testid="one">One</div><div tabindex="0">Two</div></div>
    <div tabindex="0" data-testid="after">After</div>`,
  );
  await page.getByTestId("before").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("one")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("after")).toBeFocused();
});

for (const behavior of ["feed", "toolbar itemcontrols", "grid manual"]) {
  // Native-only Canary 157.0.8102.0 visits the inactive item/actions and
  // reverse-enters at an action. V2 requires filtering and item-boundary entry:
  // https://open-ui.org/components/focusgroup-v2.explainer/#itemcontrols
  test(`${behavior}: Tab visits active controls and Shift+Tab reenters at the item`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <button data-testid="before">Before</button>
      <div focusgroup="${behavior}">
        <div focusgrouprow>
          <div tabindex="0" data-testid="one">One<button focusgroup="none" data-testid="action-one">First action</button></div>
          <div tabindex="0" data-testid="two">Two<button focusgroup="none" data-testid="action-two">Second action</button></div>
        </div>
      </div>
      <button data-testid="after">After</button>`,
    );
    await page.getByTestId("before").focus();
    await pressTab(page, project);
    await expect(page.getByTestId("one")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("action-one")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("after")).toBeFocused();
    await pressTab(page, project, true);
    await expect(page.getByTestId("one")).toBeFocused();
    await page.keyboard.press(behavior === "feed" ? "ArrowDown" : "ArrowRight");
    await expect(page.getByTestId("two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("action-two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("after")).toBeFocused();
    await pressTab(page, project, true);
    await expect(page.getByTestId("two")).toBeFocused();
  });
}

test("feed noitemcontrols leaves inactive article actions in sequential order", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed noitemcontrols">
      <div tabindex="0" data-testid="one">One<button focusgroup="none" data-testid="action-one">First action</button></div>
      <div tabindex="0" data-testid="two">Two<button focusgroup="none" data-testid="action-two">Second action</button></div>
    </div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("one").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("action-one")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("two")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("action-two")).toBeFocused();
});

test("nested item controls preserve native malformed tabindex eligibility", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="outer">
        <div focusgroup="feed">
          <div tabindex="0" data-testid="inner">Inner
            <a href="#action" tabindex="invalid" focusgroup="none" data-testid="action">Action</a>
          </div>
        </div>
      </div>
      <div tabindex="0" data-testid="other">Other</div>
    </div><button data-testid="after">After</button>`,
  );
  await page.getByTestId("inner").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("action")).toBeFocused();
  await page.getByTestId("other").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await page.getByTestId("inner").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("action")).toBeFocused();
});

for (const attribute of ["hidden", "style", "class", "inert"]) {
  test(`grid roles and navigation reconcile after ${attribute} changes`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <style>.unavailable { display: none; }</style>
      <div focusgroup="grid manual" data-testid="owner"><div focusgrouprow>
        <div><div tabindex="0" data-testid="one">One</div></div>
        <div><div tabindex="0" data-testid="two">Two</div></div>
      </div></div>`,
    );
    await expect(page.getByTestId("owner")).toHaveComputedRole("grid");
    await page.getByTestId("owner").evaluate((el) => {
      el.append(document.createTextNode(" "));
    });
    await expect(page.getByTestId("owner")).toHaveComputedRole("grid");
    await page.getByTestId("two").evaluate((el, attribute) => {
      el.setAttribute(
        attribute,
        attribute === "style"
          ? "display: none"
          : attribute === "class"
            ? "unavailable"
            : "",
      );
    }, attribute);
    // Keep the cell rendered: excluding its sole target invalidates the grid.
    // Hiding the cell itself would instead yield a narrower valid grid.
    // Native-only Canary 157.0.8102.0 retains "grid" for a hidden target,
    // contrary to https://open-ui.org/components/focusgroup-v2.explainer/#grid-state-and-invalid-structures
    await expect(page.getByTestId("owner")).not.toHaveComputedRole("grid");
    await page
      .getByTestId("two")
      .evaluate((el, attribute) => el.removeAttribute(attribute), attribute);
    await expect(page.getByTestId("owner")).toHaveComputedRole("grid");
    await page.getByTestId("one").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("two")).toBeFocused();
  });
}
