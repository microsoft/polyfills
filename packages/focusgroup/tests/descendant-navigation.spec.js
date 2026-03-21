// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// descendant-navigation/simple-descendant-test.html
test("simple descendant navigation works", async ({ page }) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar">
      <button data-testid="item1" tabindex="0">Item 1</button>
      <div>
        <button data-testid="item2" tabindex="0">Item 2 (nested)</button>
      </div>
      <button data-testid="item3" tabindex="0">Item 3</button>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item3")).toBeFocused();
});

// descendant-navigation/deeply-nested-items.html
test.describe("deeply nested items navigation", () => {
  test("forward navigation works with deeply nested focusgroup descendants", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar inline block">
        <span data-testid="item1" tabindex="0">Item 1</span>
        <div class="container">
          <div class="sub-container">
            <div class="deep-container">
              <span data-testid="item2" tabindex="0">Item 2 (deeply nested)</span>
            </div>
          </div>
        </div>
        <span>
          <span>
            <span data-testid="item3" tabindex="0">Item 3 (nested in spans)</span>
          </span>
        </span>
        <div>
          <p>Some text</p>
          <div>
            <span data-testid="item4" tabindex="0">Item 4 (nested)</span>
          </div>
        </div>
        <span data-testid="item5" tabindex="0">Item 5</span>
      </div>`,
    );

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item4")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item5")).toBeFocused();
  });

  test("backward navigation works with deeply nested focusgroup descendants", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar">
        <span data-testid="item1" tabindex="0">Item 1</span>
        <div class="container">
          <div class="sub-container">
            <div class="deep-container">
              <span data-testid="item2" tabindex="0">Item 2 (deeply nested)</span>
            </div>
          </div>
        </div>
        <span>
          <span>
            <span data-testid="item3" tabindex="0">Item 3 (nested in spans)</span>
          </span>
        </span>
        <div>
          <p>Some text</p>
          <div>
            <span data-testid="item4" tabindex="0">Item 4 (nested)</span>
          </div>
        </div>
        <span data-testid="item5" tabindex="0">Item 5</span>
      </div>`,
    );

    await page.getByTestId("item5").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item4")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item1")).toBeFocused();
  });

  test("vertical navigation works with nested descendants", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar block">
        <span data-testid="item1" tabindex="0">Item 1</span>
        <div>
          <span data-testid="item2" tabindex="0">Item 2 (nested)</span>
        </div>
      </div>`,
    );

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("item2")).toBeFocused();
  });
});

// descendant-navigation/wrapping-with-descendants.html
test.describe("wrapping with descendants", () => {
  test("forward wrapping should work from nested descendants to first item", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar inline block wrap">
        <div class="first-section">
          <button data-testid="first" tabindex="0">First Item</button>
        </div>
        <div class="middle-section">
          <div>
            <div>
              <button data-testid="middle" tabindex="0">Middle Item (nested)</button>
            </div>
          </div>
        </div>
        <div class="last-section">
          <span>
            <button data-testid="last" tabindex="0">Last Item</button>
          </span>
        </div>
      </div>`,
    );

    await page.getByTestId("last").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("first")).toBeFocused();
  });

  test("backward wrapping should work from first item to nested descendants", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar wrap">
        <div class="first-section">
          <button data-testid="first" tabindex="0">First Item</button>
        </div>
        <div class="last-section">
          <span>
            <button data-testid="last" tabindex="0">Last Item</button>
          </span>
        </div>
      </div>`,
    );

    await page.getByTestId("first").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("last")).toBeFocused();
  });

  test("normal navigation should still work correctly with nested items", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar wrap">
        <div>
          <button data-testid="first" tabindex="0">First Item</button>
        </div>
        <div>
          <div>
            <button data-testid="middle" tabindex="0">Middle Item (nested)</button>
          </div>
        </div>
        <div>
          <button data-testid="last" tabindex="0">Last Item</button>
        </div>
      </div>`,
    );

    await page.getByTestId("first").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("middle")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("last")).toBeFocused();
  });

  test("vertical wrapping works with nested descendants", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="root" focusgroup="toolbar block wrap">
        <div>
          <button data-testid="first" tabindex="0">First Item</button>
        </div>
        <div>
          <button data-testid="last" tabindex="0">Last Item</button>
        </div>
      </div>`,
    );

    await page.getByTestId("last").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("first")).toBeFocused();
  });
});

// descendant-navigation/mixed-content-navigation.html
test("navigation works with mixed content (buttons, links, inputs)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar inline block">
      <button data-testid="btn1">Button 1</button>
      <div>
        <a data-testid="link1" href="#">Link 1</a>
      </div>
      <div>
        <input data-testid="input1" type="text">
      </div>
      <button data-testid="btn2">Button 2</button>
    </div>`,
  );

  await page.getByTestId("btn1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("link1")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("input1")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByTestId("btn2")).toBeFocused();
});

// descendant-navigation/various-element-types.html
test("navigation works with various focusable element types", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar inline block">
      <button data-testid="btn">Button</button>
      <div>
        <div data-testid="div" tabindex="0">Div with tabindex</div>
      </div>
      <div>
        <span data-testid="span" tabindex="0">Span with tabindex</span>
      </div>
    </div>`,
  );

  await page.getByTestId("btn").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("div")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("span")).toBeFocused();
});
