// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

/**
 * Walk through `ids` forward (Right/Down) and backward (Left/Up), asserting
 * that arrow navigation visits each item in order. Mirrors WPT's
 * `assert_directional_navigation_bidirectional` helper.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} ids - testIds in expected navigation order
 * @param {{ axis?: "inline" | "block", shouldWrap?: boolean }} [options]
 */
async function assertBidirectional(page, ids, options = {}) {
  const { axis = "inline", shouldWrap = false } = options;
  const forward = axis === "inline" ? "ArrowRight" : "ArrowDown";
  const backward = axis === "inline" ? "ArrowLeft" : "ArrowUp";

  await page.getByTestId(ids[0]).focus();
  for (let i = 1; i < ids.length; i++) {
    await page.keyboard.press(forward);
    await expect(page.getByTestId(ids[i])).toBeFocused();
  }
  if (shouldWrap) {
    await page.keyboard.press(forward);
    await expect(page.getByTestId(ids[0])).toBeFocused();
  }

  await page.getByTestId(ids[ids.length - 1]).focus();
  for (let i = ids.length - 2; i >= 0; i--) {
    await page.keyboard.press(backward);
    await expect(page.getByTestId(ids[i])).toBeFocused();
  }
  if (shouldWrap) {
    await page.keyboard.press(backward);
    await expect(page.getByTestId(ids[ids.length - 1])).toBeFocused();
  }
}

/** Verify that arrow keys do not move focus away from the given testId. */
async function assertArrowsDoNotMoveFocus(page, testId) {
  const locator = page.getByTestId(testId);
  await locator.focus();
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]) {
    await page.keyboard.press(key);
    await expect(locator).toBeFocused();
  }
}

/** Tab through the given sequence of testIds starting from the first one. */
async function assertTabSequence(page, ids) {
  await page.getByTestId(ids[0]).focus();
  for (let i = 1; i < ids.length; i++) {
    await page.keyboard.press("Tab");
    await expect(page.getByTestId(ids[i])).toBeFocused();
  }
}

/** Shift+Tab through the given sequence of testIds starting from the first one. */
async function assertShiftTabSequence(page, ids) {
  await page.getByTestId(ids[0]).focus();
  for (let i = 1; i < ids.length; i++) {
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId(ids[i])).toBeFocused();
  }
}

// top-layer-dialog-excluded.html
test.describe("top-layer modal dialog", () => {
  test("modal dialog's own focusgroup navigates in both directions while in the top layer", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="a">A</button>
        <dialog data-testid="dlg" focusgroup="toolbar inline">
          <button data-testid="dlg_x">X</button>
          <button data-testid="dlg_y">Y</button>
          <button data-testid="dlg_close">Close</button>
        </dialog>
        <button data-testid="b">B</button>
      </div>`,
    );

    await page.getByTestId("dlg").evaluate((el) => el.showModal());

    await assertBidirectional(page, ["dlg_x", "dlg_y", "dlg_close"]);
  });
});

// top-layer-popover-excluded.html
test.describe("top-layer popover excluded from ancestor navigation", () => {
  test("arrow navigation skips a shown popover in ancestor focusgroup", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="before_pop">Before</button>
        <div data-testid="popover_simple" popover>
          <button data-testid="pop_item">Inside popover</button>
        </div>
        <button data-testid="after_pop">After</button>
      </div>`,
    );

    await page.getByTestId("popover_simple").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["before_pop", "after_pop"]);
  });

  test("arrow keys do not navigate from inside a top-layer popover without own focusgroup", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="before_pop">Before</button>
        <div data-testid="popover_simple" popover>
          <button data-testid="pop_item">Inside popover</button>
        </div>
        <button data-testid="after_pop">After</button>
      </div>`,
    );

    await page.getByTestId("popover_simple").evaluate((el) => el.showPopover());

    await assertArrowsDoNotMoveFocus(page, "pop_item");
  });

  test("popover as the first focusgroup child does not break Home/arrow navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <div data-testid="first_pop" popover>
          <button data-testid="first_pop_inner">Inside popover</button>
        </div>
        <button data-testid="first_a">A</button>
        <button data-testid="first_b">B</button>
      </div>`,
    );

    await page.getByTestId("first_pop").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["first_a", "first_b"]);

    await page.getByTestId("first_b").focus();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("first_a")).toBeFocused();
  });

  test("open popover splits an ancestor focusgroup into two segments", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="seg_a">A</button>
        <button data-testid="seg_b">B</button>
        <div data-testid="seg_pop" popover>
          <button data-testid="seg_x">X</button>
        </div>
        <button data-testid="seg_c">C</button>
        <button data-testid="seg_d">D</button>
      </div>
      <button data-testid="seg_after">After</button>`,
    );

    await page.getByTestId("seg_pop").evaluate((el) => el.showPopover());

    await assertTabSequence(page, ["seg_a", "seg_x", "seg_c", "seg_after"]);
  });

  test("popover sibling of focusgroup does not interfere with arrow navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<button data-testid="sib_before">before</button>
      <div focusgroup="tablist nomemory">
        <button data-testid="sib_info">info</button>
        <button data-testid="sib_toggle" commandfor="sib_pop" command="toggle-popover">toggle</button>
        <button data-testid="sib_copy">copy</button>
      </div>
      <button data-testid="sib_after">after</button>
      <div id="sib_pop" data-testid="sib_pop" popover focusgroup="none">
        <button data-testid="sib_share">share</button>
      </div>`,
    );

    await page.getByTestId("sib_pop").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["sib_info", "sib_toggle", "sib_copy"], {
      shouldWrap: true,
    });
  });

  test("focusgroup=none popover inside focusgroup: arrows skip, Tab reaches", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<button data-testid="none_before">before</button>
      <div focusgroup="tablist nomemory">
        <button data-testid="none_info">info</button>
        <button data-testid="none_toggle" commandfor="none_pop" command="toggle-popover">toggle</button>
        <div id="none_pop" data-testid="none_pop" popover focusgroup="none">
          <button data-testid="none_share">share</button>
        </div>
        <button data-testid="none_copy">copy</button>
      </div>
      <button data-testid="none_after">after</button>`,
    );

    await page.getByTestId("none_pop").evaluate((el) => el.showPopover());

    await page.getByTestId("none_info").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("none_toggle")).toBeFocused();

    await page.getByTestId("none_toggle").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("none_copy")).toBeFocused();

    await assertArrowsDoNotMoveFocus(page, "none_share");

    await assertTabSequence(page, [
      "none_before",
      "none_info",
      "none_share",
      "none_copy",
      "none_after",
    ]);
  });
});

// top-layer-inner-focusgroup.html
test.describe("top-layer element with own focusgroup", () => {
  test("popover with own focusgroup is excluded from ancestor arrow navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="outer_a">A</button>
        <div data-testid="popover_fg" popover focusgroup="toolbar inline">
          <button data-testid="inner_x">X</button>
          <button data-testid="inner_y">Y</button>
        </div>
        <button data-testid="outer_b">B</button>
      </div>`,
    );

    await page.getByTestId("popover_fg").evaluate((el) => el.showPopover());

    await page.getByTestId("outer_a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("outer_b")).toBeFocused();
  });

  test("inner focusgroup on a shown popover operates independently", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="outer_a">A</button>
        <div data-testid="popover_fg" popover focusgroup="toolbar inline">
          <button data-testid="inner_x">X</button>
          <button data-testid="inner_y">Y</button>
        </div>
        <button data-testid="outer_b">B</button>
      </div>`,
    );

    await page.getByTestId("popover_fg").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["inner_x", "inner_y"]);
  });

  test("focusable top-layer element with own focusgroup is not an outer entry", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="focusable_outer_a">A</button>
        <div data-testid="focusable_pop" tabindex="0" popover focusgroup="toolbar inline">
          <button data-testid="focusable_inner_x">X</button>
        </div>
        <button data-testid="focusable_outer_b">B</button>
      </div>`,
    );

    await page.getByTestId("focusable_pop").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["focusable_outer_a", "focusable_outer_b"]);
  });
});

// top-layer-dynamic-exclusion.html
test.describe("top-layer exclusion is dynamic", () => {
  const inlineFgHtml = `<div focusgroup="toolbar inline wrap">
    <button data-testid="a">A</button>
    <div data-testid="pop" popover>
      <button data-testid="x">X</button>
    </div>
    <button data-testid="b">B</button>
  </div>`;

  test("show and hide cycles", async ({ page }, { project }) => {
    await setupPage(page, project, inlineFgHtml);

    // Hidden popover phase.
    await page.getByTestId("a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();

    // Shown popover phase.
    await page.getByTestId("pop").evaluate((el) => el.showPopover());
    await page.getByTestId("a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();

    // After hiding.
    await page.getByTestId("pop").evaluate((el) => el.hidePopover());
    await page.getByTestId("a").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();
  });

  test("wrapping navigation skips shown popover subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(page, project, inlineFgHtml);
    await page.getByTestId("pop").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["a", "b"], { shouldWrap: true });
  });

  test("Home and End keys skip shown popover subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(page, project, inlineFgHtml);
    await page.getByTestId("pop").evaluate((el) => el.showPopover());

    await page.getByTestId("a").focus();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("a")).toBeFocused();

    await page.getByTestId("a").focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("b")).toBeFocused();

    await page.getByTestId("b").focus();
    await page.keyboard.press("Home");
    await expect(page.getByTestId("a")).toBeFocused();
  });

  test("block-axis navigation skips shown popover subtree", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar block">
        <button data-testid="up">Up</button>
        <div data-testid="pop_block" popover>
          <button data-testid="block_inner">Inner</button>
        </div>
        <button data-testid="down">Down</button>
      </div>`,
    );
    await page.getByTestId("pop_block").evaluate((el) => el.showPopover());

    await page.getByTestId("up").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("down")).toBeFocused();

    await page.getByTestId("down").focus();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("up")).toBeFocused();
  });

  test("arrow navigation skips multiple simultaneously shown popovers", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <button data-testid="m_a">A</button>
        <div data-testid="pop_m1" popover>
          <button data-testid="m_x1">X1</button>
        </div>
        <button data-testid="m_b">B</button>
        <div data-testid="pop_m2" popover>
          <button data-testid="m_x2">X2</button>
        </div>
        <button data-testid="m_c">C</button>
      </div>`,
    );
    await page.getByTestId("pop_m1").evaluate((el) => el.showPopover());
    await page.getByTestId("pop_m2").evaluate((el) => el.showPopover());

    await assertBidirectional(page, ["m_a", "m_b", "m_c"]);
  });

  test("focusgroup memory falls through when the remembered item enters the top layer", async ({
    page,
  }, { project }) => {
    test.fixme(
      project.use.channel !== "chrome-canary",
      "Top-layer exclusion not yet implemented in the polyfill",
    );
    await setupPage(
      page,
      project,
      `<button data-testid="mem_before">Before</button>
      <div focusgroup="toolbar inline">
        <button data-testid="mem_a">A</button>
        <div data-testid="mem_pop">
          <button data-testid="mem_x">X</button>
        </div>
        <button data-testid="mem_b">B</button>
      </div>
      <button data-testid="mem_after">After</button>`,
    );

    await page.getByTestId("mem_x").focus();
    await expect(page.getByTestId("mem_x")).toBeFocused();

    await page.getByTestId("mem_pop").evaluate((el) => {
      el.setAttribute("popover", "");
      el.showPopover();
    });

    await page.getByTestId("mem_before").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("mem_a")).toBeFocused();
  });
});

// top-layer-popover-invoker.html
test.describe("popover invoker inside focusgroup", () => {
  const invokerHtml = `<div focusgroup="toolbar inline">
    <button data-testid="before">Before</button>
    <button data-testid="invoker" popovertarget="pop">Invoker</button>
    <button data-testid="after">After</button>
  </div>
  <div id="pop" data-testid="pop" popover>
    <button data-testid="pop_first">Popover first</button>
    <button data-testid="pop_last">Popover last</button>
  </div>
  <button data-testid="outside">Outside</button>`;

  async function openViaInvoker(page) {
    await page.getByTestId("invoker").focus();
    await page.getByTestId("invoker").click();
    await expect(page.getByTestId("pop")).toBeVisible();
  }

  test("arrow keys skip a popover opened by a focusgroup-item invoker", async ({
    page,
  }, { project }) => {
    await setupPage(page, project, invokerHtml);
    await openViaInvoker(page);

    await assertBidirectional(page, ["before", "invoker", "after"]);
  });

  test("Tab from a focusgroup-item invoker enters the open popover", async ({
    page,
  }, { project }) => {
    await setupPage(page, project, invokerHtml);
    await openViaInvoker(page);

    await assertTabSequence(page, [
      "invoker",
      "pop_first",
      "pop_last",
      "outside",
    ]);
  });

  test("Shift+Tab from popover content opened by an invoker returns to the invoker", async ({
    page,
  }, { project }) => {
    await setupPage(page, project, invokerHtml);
    await openViaInvoker(page);

    await assertShiftTabSequence(page, ["pop_first", "invoker"]);
  });

  test("Tab and Shift+Tab on a tabindex=-1 popover invoker do not crash", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<button data-testid="outside">Outside</button>
      <div focusgroup="menu">
        <button data-testid="neg_invoker" tabindex="-1"
                commandfor="neg_pop" command="toggle-popover">icecream</button>
      </div>
      <div id="neg_pop" data-testid="neg_pop" popover>popover</div>
      <button data-testid="neg_after">bread</button>`,
    );

    await page.getByTestId("neg_invoker").click();
    await expect(page.getByTestId("neg_pop")).toBeVisible();

    await page.getByTestId("neg_invoker").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("neg_after")).toBeFocused();

    await page.getByTestId("neg_after").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("outside")).toBeFocused();
  });

  test("Tab from a popovertarget invoker reaches the popover even when it precedes the invoker", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <div id="pt_pop" data-testid="pt_pop" popover>
          <button data-testid="pt_pop_first">Popover first</button>
        </div>
        <button data-testid="pt_before">Before</button>
        <button data-testid="pt_invoker" popovertarget="pt_pop">Invoker</button>
      </div>
      <button data-testid="pt_outside">Outside</button>`,
    );

    await page.getByTestId("pt_invoker").focus();
    await page.getByTestId("pt_invoker").click();
    await expect(page.getByTestId("pt_pop")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("pt_pop_first")).toBeFocused();
  });

  test("Tab from a commandfor invoker reaches the popover even when it precedes the invoker", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <div id="cf_pop" data-testid="cf_pop" popover>
          <button data-testid="cf_pop_first">Popover first</button>
        </div>
        <button data-testid="cf_before">Before</button>
        <button data-testid="cf_invoker" commandfor="cf_pop" command="toggle-popover">Invoker</button>
      </div>
      <button data-testid="cf_outside">Outside</button>`,
    );

    await page.getByTestId("cf_invoker").focus();
    await page.getByTestId("cf_invoker").click();
    await expect(page.getByTestId("cf_pop")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cf_pop_first")).toBeFocused();
  });

  test("Tab from a showPopover source invoker reaches the popover even when it precedes the invoker", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar inline">
        <div id="src_pop" data-testid="src_pop" popover>
          <button data-testid="src_pop_first">Popover first</button>
        </div>
        <button data-testid="src_before">Before</button>
        <button data-testid="src_invoker">Invoker</button>
      </div>
      <button data-testid="src_outside">Outside</button>`,
    );

    await page.getByTestId("src_invoker").focus();
    await page.evaluate(() => {
      const pop = document.getElementById("src_pop");
      const invoker = document.querySelector('[data-testid="src_invoker"]');
      pop.showPopover({ source: invoker });
    });
    await expect(page.getByTestId("src_pop")).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("src_pop_first")).toBeFocused();
  });
});
