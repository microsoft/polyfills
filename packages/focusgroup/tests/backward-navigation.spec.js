// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// backward-navigation/does-not-move-when-on-focusgroup-root.html
test("does not move when focused on focusgroup root", async ({ page }) => {
  await setupPage(
    page,
    `<div data-testid="root" tabindex="0" focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("root").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("root")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("root")).toBeFocused();
});

// backward-navigation/does-not-move-when-on-non-focusgroup-item.html
test("does not move when focused on element that is not a focusgroup item", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>
    <span data-testid="nonitem1" tabindex="0">nonitem1</span>`,
  );

  await page.getByTestId("nonitem1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("nonitem1")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("nonitem1")).toBeFocused();
});

// backward-navigation/does-not-move-when-only-one-item-and-wraps.html
test("does not move when there is only one item even with wrap", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/does-not-move-when-only-one-item.html
test("does not move when there is only one item", async ({ page }) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/does-not-move-when-outside-focusgroup.html
test("does not move when focused on element outside focusgroup", async ({
  page,
}) => {
  await setupPage(
    page,
    `<span data-testid="out" tabindex="0">out</span>
    <div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("out").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("out")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("out")).toBeFocused();
});

// backward-navigation/does-not-wrap-when-not-supported.html
test("does not wrap backward when wrap is not specified", async ({ page }) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/moves-to-previous-item-and-skips-focusable-item.html
test("moves to previous item and skips non-focusable elements", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item3").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/moves-to-previous-item.html
test("moves to previous item on ArrowUp and ArrowLeft", async ({ page }) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/skips-non-focusgroup-subtree.html
test("skips focusgroup=none subtree when navigating backward", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <div focusgroup="none">
        <span data-testid="item2" tabindex="0">item2</span>
        <span data-testid="item3" tabindex="0">item3</span>
      </div>
      <span data-testid="item4" tabindex="0">item4</span>
    </div>`,
  );

  await page.getByTestId("item4").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.getByTestId("item4").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/skips-root-focusgroup-complex-case.html
test("skips deeply nested root focusgroup subtrees when navigating backward (complex)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <div>
        <div focusgroup="toolbar inline block">
          <div data-testid="item2" tabindex="0">
            <div focusgroup="toolbar inline block">
              <span data-testid="item3" tabindex="0">item3</span>
              <span data-testid="item4" tabindex="0">item4</span>
            </div>
          </div>
        </div>
      </div>
      <span data-testid="item5" tabindex="0">item5</span>
    </div>`,
  );

  await page.getByTestId("item5").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.getByTestId("item5").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/skips-root-focusgroup.html
test("skips unrelated root focusgroup subtree when navigating backward", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <div>
        <div focusgroup="toolbar inline block">
          <span data-testid="item2" tabindex="0">item2</span>
          <span data-testid="item3" tabindex="0">item3</span>
        </div>
      </div>
      <span data-testid="item4" tabindex="0">item4</span>
    </div>`,
  );

  await page.getByTestId("item4").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.getByTestId("item4").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

test("skip hidden candidates", async ({ page }) => {
  await setupPage(
    page,
    `
    <div focusgroup="tablist">
      <button data-testid="item1">item1</button>
      <div hidden>
        <button>item2</button>
      </div>
      <button data-testid="item3">item3</button>
    </div>
  `,
  );

  await page.getByTestId("item3").focus();
  await page.keyboard.press("ArrowLeft");

  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/wraps-successfully-complex-case.html
test("wraps successfully when there are non-item elements before and after items", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <div>
        <span data-testid="nonitem1">nonitem1</span>
        <span data-testid="nonitem2">nonitem2</span>
      </div>
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
      <div>
        <span data-testid="nonitem3">nonitem3</span>
        <span data-testid="nonitem4">nonitem4</span>
      </div>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item3")).toBeFocused();

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item3")).toBeFocused();
});

// backward-navigation/wraps-successfully.html
test("wraps successfully from first item to last", async ({ page }) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item3")).toBeFocused();

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item3")).toBeFocused();
});

// backward-navigation/horizontal/does-not-ascend-out-of-focusgroup.html
test("horizontal: does not ascend out of nested focusgroup when axis not supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<ul focusgroup="toolbar inline">
      <li data-testid="item1" tabindex="0">
        <ul focusgroup="toolbar block">
          <li data-testid="item2" tabindex="0">item2</li>
        </ul>
      </li>
    </ul>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// backward-navigation/horizontal/does-not-move-when-axis-not-supported.html
test("horizontal: does not move when axis (ArrowLeft) is not supported (block only)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// backward-navigation/horizontal/does-not-wrap-in-orthogonal-axis.html
test("horizontal: does not wrap when only block (vertical) axis is supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/horizontal/moves-when-only-current-axis-supported.html
test("horizontal: moves when only horizontal axis (ArrowLeft) is supported (inline only)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar inline">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/horizontal/wraps-in-axis.html
test("horizontal: wraps backward when inline axis and wrap are supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("item3")).toBeFocused();
});

// backward-navigation/vertical/does-not-ascend-out-of-focusgroup.html
test("vertical: does not ascend out of nested focusgroup when axis not supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<ul focusgroup="toolbar block">
      <li data-testid="item1" tabindex="0">
        <ul focusgroup="toolbar inline">
          <li data-testid="item2" tabindex="0">item2</li>
        </ul>
      </li>
    </ul>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// backward-navigation/vertical/does-not-move-when-axis-not-supported.html
test("vertical: does not move when axis (ArrowUp) is not supported (inline only)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar inline">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// backward-navigation/vertical/does-not-wrap-in-orthogonal-axis.html
test("vertical: does not wrap when only inline (horizontal) axis is supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar inline wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/vertical/moves-when-only-current-axis-supported.html
test("vertical: moves when only vertical axis (ArrowUp) is supported (block only)", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="root" focusgroup="toolbar block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// backward-navigation/vertical/wraps-in-axis.html
test("vertical: wraps backward when block axis and wrap are supported", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div focusgroup="toolbar block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("item3")).toBeFocused();
});
