// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// behavior-first-requirement.html
test.describe("behavior token can appear in any position", () => {
  const defs = [
    { focusgroup: "toolbar", valid: true },
    { focusgroup: "tablist inline", valid: true },
    { focusgroup: "radiogroup wrap", valid: true },
    { focusgroup: "wrap tablist", valid: true },
    { focusgroup: "inline menubar", valid: true },
    { focusgroup: "", valid: false },
    { focusgroup: "inline", valid: false },
    { focusgroup: "wrap", valid: false },
  ];

  for (const def of defs) {
    const testName = [
      def.valid ? "valid" : "invalid",
      `'${def.focusgroup}'`,
      "attribute value",
      def.valid ? "enables" : "doesn’t enable",
      "navigation",
    ].join(" ");

    test(testName, async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="${def.focusgroup}">
          <span data-testid="item1" tabindex="0">item 1</span>
          <span data-testid="item2" tabindex="0">item 2</span>
        </div>
      `,
      );

      await page.getByTestId("item1").focus();
      await page.keyboard.press("ArrowRight");

      if (def.valid) {
        await expect(page.getByTestId("item2")).toBeFocused();
      } else {
        await expect(page.getByTestId("item1")).toBeFocused();
      }
    });
  }
});

// behavior-tokens-comprehensive.html
test.describe("behavior tokens comprehensive", () => {
  let item1;
  let item2;
  let item3;

  test.beforeEach(({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    item3 = page.getByTestId("item3");
  });

  test.describe("feed: block-axis navigation and default itemcontrols", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="feed">
          <article data-testid="item1" tabindex="0">item1</article>
          <article data-testid="item2" tabindex="0">item2</article>
          <article data-testid="item3" tabindex="0">item3</article>
        </div>
      `,
      );
    });

    test.test("feed: ArrowDown navigates (block)", async ({ page }) => {
      await page.getByTestId("item1").focus();
      await page.keyboard.press("ArrowDown");

      await expect(page.getByTestId("item2")).toBeFocused();
    });

    test.test("feed: ArrowRight blocked (block-only)", async ({ page }) => {
      await page.getByTestId("item1").focus();
      await page.keyboard.press("ArrowRight");

      await expect(page.getByTestId("item1")).toBeFocused();
    });

    test("itemcontrols exposes controls only for the active item", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="feed">
          <article data-testid="card1" tabindex="0">
            Card 1
            <button data-testid="action1" focusgroup="none">Action 1</button>
            <button data-testid="action1-explicit" tabindex="0" focusgroup="none">Action 1 explicit</button>
          </article>
          <article data-testid="card2" tabindex="0">
            Card 2
            <button data-testid="action2" focusgroup="none">Action 2</button>
          </article>
        </div>
        <button data-testid="after">After</button>
      `,
      );

      const card1 = page.getByTestId("card1");
      const card2 = page.getByTestId("card2");
      const action1 = page.getByTestId("action1");
      const action1Explicit = page.getByTestId("action1-explicit");
      const action2 = page.getByTestId("action2");

      await card1.focus();
      await expect(action1).not.toHaveAttribute("tabindex");
      await expect(action1Explicit).toHaveAttribute("tabindex", "0");
      await expect(action2).toHaveAttribute("tabindex", "-1");

      await page.keyboard.press("Tab");
      await expect(action1).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(action1Explicit).toBeFocused();
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.dataset.testid),
      ).toBe("after");

      await card1.focus();
      await page.keyboard.press("ArrowDown");
      await expect(card2).toBeFocused();
      await expect(action1).toHaveAttribute("tabindex", "-1");
      await expect(action1Explicit).toHaveAttribute("tabindex", "-1");
      await expect(action2).not.toHaveAttribute("tabindex");
    });

    test("noitemcontrols preserves ordinary segment behavior", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="feed noitemcontrols">
          <article data-testid="card1" tabindex="0">
            Card 1
            <button data-testid="action1" focusgroup="none">Action 1</button>
          </article>
          <article data-testid="card2" tabindex="0">Card 2</article>
        </div>
      `,
      );

      await expect(page.getByTestId("action1")).not.toHaveAttribute("tabindex");
      await expect(page.getByTestId("card2")).toHaveAttribute("tabindex", "0");
    });
  });

  test.describe("toolbar: inline only, no wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="toolbar">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("toolbar: ArrowRight navigates (inline)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("toolbar: ArrowDown blocked (inline-only)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test.test("toolbar: does not wrap", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });
  });

  test.describe("tablist: inline + wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="tablist">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("tablist: ArrowRight navigates (inline)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("tablist: ArrowDown blocked (inline-only)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test.test("tablist: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("menu: block + wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="menu">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("menu: ArrowDown navigates (block)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test.test("menu: ArrowRight blocked (block-only)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test.test("menu: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("menubar: inline + wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="menubar">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("menubar: ArrowRight navigates (inline)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("menubar: ArrowDown blocked (inline-only)", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test.test("menubar: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("radiogroup: both axes, wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="radiogroup">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("radiogroup: ArrowRight navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("radiogroup: ArrowDown navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test.test("radiogroup: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("listbox: block only, no wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("listbox: ArrowRight doesn’t navigate", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test.test("listbox: ArrowDown navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test.test("listbox: does not wrap", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });
  });

  test.describe("none: opt-out", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="none">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
        </div>
      `,
      );
    });

    test.test("none: no navigation", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();

      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("tablist block: explicit block overrides default inline", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="tablist block">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("tablist block: ArrowDown navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test.test("tablist block: ArrowRight blocked", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test.test("tablist block: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("tablist nowrap: suppresses default wrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="tablist nowrap">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("tablist nowrap: ArrowRight navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("tablist nowrap: does not wrap", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });
  });

  test.describe("menu inline: explicit inline overrides default block", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="menu inline">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("menu inline: ArrowRight navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("menu inline: ArrowDown blocked", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test.test("menu inline: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("listbox inline wrap: explicit inline overrides default both axes and suppress default nowrap", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox inline wrap">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("listbox inline: ArrowRight navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("listbox inline: ArrowDown blocked", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test.test("listbox inline: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("tablist both axes", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="tablist inline block">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );
    });

    test.test("tablist block: ArrowDown navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test.test("tablist block: ArrowRight navigates", async ({ page }) => {
      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test.test("tablist block: wraps", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });
  });
});
