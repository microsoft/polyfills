// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// shadow/shadow-items-basic.html
test.describe("focusgroup with shadow items", () => {
  let item1, item2, item3;

  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div focusgroup="toolbar inline">
        <template shadowrootmode="open">
          <button data-testid="item1">One</button>
          <button data-testid="item2">Two</button>
          <button data-testid="item3">Three</button>
        </template>
      </div>
    `,
    );

    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    item3 = page.getByTestId("item3");
  });

  test("ArrowRight navigates between shadow root items", async ({ page }) => {
    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item2).toBeFocused();
  });

  test("ArrowRight does not wrap when at last shadow item (no wrap token)", async ({
    page,
  }) => {
    await item3.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item3).toBeFocused();
  });

  test("ArrowLeft navigates backward", async ({ page }) => {
    await item2.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");

    await expect(item3).toBeFocused();

    await page.keyboard.press("ArrowLeft");

    await expect(item2).toBeFocused();
  });
});

// shadow/shadow-nested-scope.html
test.describe("nested shadow focusgroup", () => {
  let outer1, outer2, inner1, inner2;

  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div focusgroup="toolbar inline">
        <button data-testid="outer1">Outer 1</button>
        <div>
          <template shadowrootmode="open">
            <div focusgroup="toolbar inline">
              <button data-testid="inner1">Inner 1</button>
              <button data-testid="inner2">Inner 2</button>
            </div>
          </template>
        </div>
        <button data-testid="outer2">Outer 2</button>
      </div>
    `,
    );

    outer1 = page.getByTestId("outer1");
    outer2 = page.getByTestId("outer2");
    inner1 = page.getByTestId("inner1");
    inner2 = page.getByTestId("inner2");
  });

  test("outer navigation skips shadow host containing inner focusgroup", async ({
    page,
  }) => {
    await outer1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(outer2).toBeFocused();
  });

  test("inner shadow focusgroup navigation advances within its own scope", async ({
    page,
  }) => {
    await inner1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(inner2).toBeFocused();
  });

  test("inner shadow navigation does not wrap past last item", async ({
    page,
  }) => {
    await inner2.focus();
    await page.keyboard.press("ArrowRight");

    await expect(inner2).toBeFocused();
  });
});

test.describe("focusgroup with slotted items", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div focusgroup="toolbar">
        <template shadowrootmode="open">
          <button data-testid="item1">One</button>
          <slot></slot>
          <button data-testid="item3">Three</button>
        </template>
        <button data-testid="item2">Two</button>
      </div>
    `,
    );
  });

  test("ArrowRight navigates between shadow and slotted items", async ({
    page,
  }) => {
    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item3")).toBeFocused();
  });
});

test.describe("focusgroup with light and shadow items", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div focusgroup="toolbar inline">
        <button data-testid="item1">One</button>
        <span>
          <template shadowrootmode="open">
            <button data-testid="item2">Two</button>
          </template>
        </span>
        <button data-testid="item3">Three</button>
      </div>
    `,
    );
  });

  test("ArrowRight navigates between light and shadow items", async ({
    page,
  }) => {
    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item3")).toBeFocused();
  });
});

test.describe("focusgroup with light, shadow, and slotted items", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div focusgroup="toolbar inline">
        <button data-testid="item1">One</button>
        <span>
          <template shadowrootmode="open">
            <button data-testid="item2">Two</button>
            <slot></slot>
            <button data-testid="item4">Four</button>
          </template>
          <button data-testid="item3">Three</button>
        </span>
        <button data-testid="item5">Five</button>
      </div>
    `,
    );
  });

  test("navigates between light, shadow, and slotted items", async ({
    page,
  }) => {
    await page.getByTestId("item1").focus();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item4")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item5")).toBeFocused();

    await page.keyboard.press("ArrowRight"); // Make sure the pointer doesn’t overshoot
    await expect(page.getByTestId("item5")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item4")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item3")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item2")).toBeFocused();
  });
});

test.describe("focusgroup with nested group mixed with shadow and slotted children", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `
      <div data-testid="before" tabindex="0">before</div>
      <div focusgroup="toolbar">
        <button data-testid="item1">item 1</button>
        <button data-testid="item2">item 2</button>
        <span>
          <template shadowrootmode="open">
            <span focusgroup="toolbar wrap">
              <button data-testid="nested-shadow-first">nested shadow first</button>
              <slot></slot>
              <button data-testid="nested-shadow-last">nested shadow last</button>
            </span>
          </template>
          <button data-testid="nested-slotted-1">nested slotted 1</button>
          <button focusgroupstart data-testid="nested-slotted-2">nested slotted 2</button>
          <button data-testid="nested-slotted-3">nested slotted 3</button>
        </span>
        <button data-testid="item3">item 3</button>
        <button data-testid="item4">item 4</button>
      </div>
      <div data-testid="after" tabindex="0">after</div>
    `,
    );
  });

  test("navigates between parent and nested groups", async ({ page }) => {
    await page.getByTestId("before").focus();

    await page.keyboard.press("Tab");

    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item4")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(page.getByTestId("nested-slotted-2")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByTestId("nested-shadow-first")).toBeFocused();

    await page.keyboard.press("ArrowLeft");

    await expect(page.getByTestId("nested-shadow-last")).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(page.getByTestId("item3")).toBeFocused();
  });
});
