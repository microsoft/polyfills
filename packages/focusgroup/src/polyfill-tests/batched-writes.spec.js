// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("batched control writes retain author reactions before a later control is updated", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <batch-trigger tabindex="0" focusgroup="none">Trigger</batch-trigger>
        <button tabindex="0" focusgroup="none" data-testid="action">Action</button>
      </div><div tabindex="0" data-testid="two">Two</div>
    </div>`,
  );
  await page.getByTestId("one").focus();
  await page.evaluate(() => {
    customElements.define(
      "batch-trigger",
      class extends HTMLElement {
        static observedAttributes = ["tabindex"];
        attributeChangedCallback(_name, oldValue, value) {
          if (oldValue === "0" && value === "-1") {
            const action = document.querySelector('[data-testid="action"]');
            action.setAttribute("tabindex", "-1");
            action.setAttribute("tabindex", "0");
          }
        }
      },
    );
  });
  await page.getByTestId("two").focus();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "0");
});

test("previous provenance observers can still notify current observers of managed writes", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed"><div tabindex="0" data-testid="one">One</div>
    <div tabindex="0" data-testid="two">Two</div></div>`,
  );
  await page.evaluate(() => {
    const element = document.querySelector('[data-testid="two"]');
    const write = { element, oldValue: element.getAttribute("tabindex") };
    for (const observer of globalThis.__FOCUSGROUP_POLYFILL__.p) {
      observer.beginWrite(write);
    }
    element.setAttribute("tabindex", "0");
    for (const observer of globalThis.__FOCUSGROUP_POLYFILL__.p) {
      observer.endWrite(write);
    }
  });
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
});
