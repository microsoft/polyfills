// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// opt-out-barriers/none-creates-barriers.html
test.describe("none creates navigation barriers", () => {
  test("forward navigation skips opted-out subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <button data-testid="item2" tabindex="0">Item 2</button>
        <div data-testid="optout" focusgroup="none">
          <button data-testid="optout_item1" tabindex="0">Opted out item 1</button>
          <div>
            <button data-testid="optout_item2" tabindex="0">Opted out item 2</button>
          </div>
        </div>
        <button data-testid="item3" tabindex="0">Item 3</button>
        <button data-testid="item4" tabindex="0">Item 4</button>
      </div>`,
    );

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");

    await page.getByTestId("item2").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item3")).toBeFocused();
  });

  test("backward navigation skips opted-out subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <button data-testid="item2" tabindex="0">Item 2</button>
        <div data-testid="optout" focusgroup="none">
          <button data-testid="optout_item1" tabindex="0">Opted out item 1</button>
          <div>
            <button data-testid="optout_item2" tabindex="0">Opted out item 2</button>
          </div>
        </div>
        <button data-testid="item3" tabindex="0">Item 3</button>
        <button data-testid="item4" tabindex="0">Item 4</button>
      </div>`,
    );

    await page.getByTestId("item4").focus();
    await page.keyboard.press("ArrowLeft");

    await page.getByTestId("item3").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item2")).toBeFocused();
  });

  test("arrow keys do not work within opted-out sections", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <div data-testid="optout" focusgroup="none">
          <button data-testid="optout_item1" tabindex="0">Opted out item 1</button>
          <div>
            <button data-testid="optout_item2" tabindex="0">Opted out item 2</button>
          </div>
        </div>
        <button data-testid="item2" tabindex="0">Item 2</button>
      </div>`,
    );

    await page.getByTestId("optout_item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("optout_item1")).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("optout_item1")).toBeFocused();
  });
});

// opt-out-barriers/none-opt-out-direct-child.html
test.describe("none opt-out direct child", () => {
  test("forward arrow navigation skips opted-out direct child", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="toolbar" focusgroup="toolbar">
        <button data-testid="first">First</button>
        <button data-testid="optedout" focusgroup="none">opted out</button>
        <button data-testid="last">Last</button>
      </div>`,
    );

    await page.getByTestId("first").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("last")).toBeFocused();
  });

  test("backward arrow navigation skips opted-out direct child", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="toolbar" focusgroup="toolbar">
        <button data-testid="first">First</button>
        <button data-testid="optedout" focusgroup="none">opted out</button>
        <button data-testid="last">Last</button>
      </div>`,
    );

    await page.getByTestId("last").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("first")).toBeFocused();
  });

  test("arrow keys do not work from opted-out element", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="toolbar" focusgroup="toolbar">
        <button data-testid="first">First</button>
        <button data-testid="optedout" focusgroup="none">opted out</button>
        <button data-testid="last">Last</button>
      </div>`,
    );

    await page.getByTestId("optedout").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("optedout")).toBeFocused();

    await page.getByTestId("optedout").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("optedout")).toBeFocused();
  });
});

// opt-out-barriers/complex-nested-opt-out.html
test.describe("complex nested opt-out scenarios", () => {
  test("outer focusgroup navigation skips opted-out subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <div>
          <button data-testid="item2" tabindex="0">Item 2</button>
          <div data-testid="optout1" focusgroup="none">
            <button data-testid="optout_item1" tabindex="0">Opted out 1</button>
            <div>
              <button data-testid="optout_item2" tabindex="0">Opted out 2 (nested)</button>
              <div data-testid="nested_in_optout" focusgroup="menu">
                <button data-testid="nested_optout_item1" tabindex="0">Nested in opt-out 1</button>
                <button data-testid="nested_optout_item2" tabindex="0">Nested in opt-out 2</button>
              </div>
            </div>
          </div>
          <button data-testid="item3" tabindex="0">Item 3</button>
        </div>
        <div>
          <div>
            <button data-testid="item4" tabindex="0">Item 4 (deeply nested)</button>
          </div>
        </div>
      </div>`,
    );

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item4")).toBeFocused();
  });

  test("opt-out subtree blocks navigation for its own items", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <div data-testid="optout1" focusgroup="none">
          <button data-testid="optout_item1" tabindex="0">Opted out 1</button>
          <div>
            <button data-testid="optout_item2" tabindex="0">Opted out 2 (nested)</button>
          </div>
        </div>
        <button data-testid="item2" tabindex="0">Item 2</button>
      </div>`,
    );

    await page.getByTestId("optout_item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("optout_item1")).toBeFocused();

    await page.getByTestId("optout_item2").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("optout_item2")).toBeFocused();
  });

  test("nested focusgroup inside opted-out subtree still works internally", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <div data-testid="optout1" focusgroup="none">
          <button data-testid="optout_item1" tabindex="0">Opted out 1</button>
          <div data-testid="nested_in_optout" focusgroup="toolbar">
            <button data-testid="nested_optout_item1" tabindex="0">Nested in opt-out 1</button>
            <button data-testid="nested_optout_item2" tabindex="0">Nested in opt-out 2</button>
          </div>
        </div>
        <button data-testid="item2" tabindex="0">Item 2</button>
      </div>`,
    );

    await page.getByTestId("nested_optout_item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("nested_optout_item2")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("nested_optout_item1")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("nested_optout_item1")).toBeFocused();
  });

  test("backward outer navigation skips opted-out subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="root" focusgroup="toolbar">
        <button data-testid="item1" tabindex="0">Item 1</button>
        <div>
          <button data-testid="item2" tabindex="0">Item 2</button>
          <div data-testid="optout1" focusgroup="none">
            <button data-testid="optout_item1" tabindex="0">Opted out 1</button>
          </div>
          <button data-testid="item3" tabindex="0">Item 3</button>
        </div>
        <div>
          <div>
            <button data-testid="item4" tabindex="0">Item 4 (deeply nested)</button>
          </div>
        </div>
      </div>`,
    );

    await page.getByTestId("item4").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item2")).toBeFocused();
  });
});
