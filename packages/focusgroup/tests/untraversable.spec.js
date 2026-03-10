import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// untraversable-tabindex-minus-one.html
test.describe("elements with tabindex=-1 participate in focusgroup navigation when focused, otherwise skipped", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `<div focusgroup="toolbar">
          <button data-testid="b1">Button 1</button>
          <div data-testid="b2" tabindex="-1">Button 2</div>
          <button data-testid="b3">Button 3</button>
        </div>`,
    );
  });

  test("ArrowRight from tabindex=-1 element moves to next item", async ({
    page,
  }) => {
    await page.getByTestId("b2").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b3")).toBeFocused();
  });

  test("ArrowLeft from tabindex=-1 element moves to previous item", async ({
    page,
  }) => {
    await page.getByTestId("b2").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("b1")).toBeFocused();
  });

  test("ArrowRight from b1 skips b2 (tabindex=-1) and goes to b3", async ({
    page,
  }) => {
    await page.getByTestId("b1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b3")).toBeFocused();
  });

  test("ArrowLeft from b3 skips b2 (tabindex=-1) and goes to b1", async ({
    page,
  }) => {
    await page.getByTestId("b3").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("b1")).toBeFocused();
  });
});

test.describe("navigation respects bounds when edges are tabindex=-1", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `<div focusgroup="toolbar">
        <div data-testid="start" tabindex="-1">Start</div>
        <button data-testid="mid">Mid</button>
        <div data-testid="end" tabindex="-1">End</div>
      </div>`,
    );
  });

  test("ArrowRight from mid stays at mid when end is tabindex=-1 and no wrap", async ({
    page,
  }) => {
    await page.getByTestId("mid").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("mid")).toBeFocused();
  });

  test("ArrowLeft from mid stays at mid when start is tabindex=-1 and no wrap", async ({
    page,
  }) => {
    await page.getByTestId("mid").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("mid")).toBeFocused();
  });

  test("ArrowRight from start (tabindex=-1) goes to mid", async ({ page }) => {
    await page.getByTestId("start").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("mid")).toBeFocused();
  });

  test("ArrowLeft from end (tabindex=-1) goes to mid", async ({ page }) => {
    await page.getByTestId("end").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("mid")).toBeFocused();
  });
});

test.describe("wrapping logic skips items with tabindex=-1", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(
      page,
      `<div focusgroup="toolbar wrap">
        <div data-testid="w1" tabindex="-1">W1</div>
        <button data-testid="w2">W2</button>
        <button data-testid="w3">W3</button>
        <div data-testid="w4" tabindex="-1">W4</div>
      </div>`,
    );
  });

  test("wrapping forward from last focusable item skips tabindex=-1 ends", async ({
    page,
  }) => {
    await page.getByTestId("w3").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("w2")).toBeFocused();
  });

  test("wrapping backward from first focusable item skips tabindex=-1 ends", async ({
    page,
  }) => {
    await page.getByTestId("w2").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("w3")).toBeFocused();
  });
});
