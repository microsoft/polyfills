// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

test("a focusable nested owner used as a feed item remains its Tab entry point", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <button data-testid="before">Before</button>
    <div focusgroup="feed">
      <div focusgroup="toolbar" tabindex="0" data-testid="one">
        <button data-testid="bold">Bold</button>
      </div>
      <article tabindex="0" data-testid="two">Two</article>
    </div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("before").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("one")).toBeFocused();
});

test("a toolbar inside an inactive feed item keeps its items after it mutates", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <article tabindex="0" data-testid="one">One</article>
      <article tabindex="0" data-testid="two">
        Two
        <div focusgroup="toolbar" data-testid="toolbar">
          <button data-testid="like">Like</button>
          <button data-testid="share">Share</button>
        </div>
      </article>
    </div>`,
  );
  await page.getByTestId("one").focus();
  // Rebuild the toolbar while its item is inactive (its buttons suppressed).
  await page.evaluate(() => {
    const more = document.createElement("button");
    more.textContent = "More";
    more.dataset.testid = "more";
    document.querySelector('[data-testid="toolbar"]').append(more);
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("like")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("share")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("more")).toBeFocused();
});

test("a nested grid inside an inactive feed item stays navigable after it mutates", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <article tabindex="0" data-testid="one">One</article>
      <article tabindex="0" data-testid="two">
        Two
        <div focusgroup="grid manual" data-testid="grid">
          <div focusgrouprow>
            <button data-testid="a1">A1</button><button data-testid="a2">A2</button>
          </div>
        </div>
      </article>
    </div>`,
  );
  await page.getByTestId("one").focus();
  await page.evaluate(() => {
    document.querySelector('[data-testid="a2"]').textContent = "A2!";
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("a1")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
});

test("arrowing from a negative-tabindex grid source remembers the destination cell", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <button data-testid="before">Before</button>
    <div focusgroup="grid manual">
      <div focusgrouprow>
        <div data-testid="a1-cell"><span data-testid="a1-source" tabindex="-1">Source</span><button data-testid="a1">A1</button></div>
        <button data-testid="a2">A2</button>
      </div>
    </div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("a1-source").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
  await page.getByTestId("before").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("a2")).toBeFocused();
});
