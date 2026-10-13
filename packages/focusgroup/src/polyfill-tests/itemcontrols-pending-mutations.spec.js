// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

for (const behavior of ["feed", "grid manual"]) {
  for (const mutation of ["hidden", "style", "remove", "tabindex"]) {
    test(`${behavior}: pending ${mutation} survives same-task focus and control filtering`, async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="${behavior}">
          <div focusgrouprow>
            <div tabindex="0" data-testid="one">One
              <button focusgroup="none" data-testid="action">Action</button>
            </div>
            <div tabindex="0" data-testid="two">Two
              <button focusgroup="none">Other action</button>
            </div>
          </div>
        </div>
        <button data-testid="after">After</button>`,
      );
      await page.getByTestId("two").focus();
      await page.evaluate((mutation) => {
        const one = document.querySelector('[data-testid="one"]');
        if (mutation === "hidden") {
          one.hidden = true;
        }
        if (mutation === "style") {
          one.style.display = "none";
        }
        if (mutation === "remove") {
          one.remove();
        }
        if (mutation === "tabindex") {
          one.setAttribute("tabindex", "-1");
        }
        document.querySelector('[data-testid="after"]').focus();
      }, mutation);
      if (mutation !== "remove") {
        await expect(page.getByTestId("one")).not.toHaveAttribute(
          "data-fg-item",
        );
      }
      await page.getByTestId("two").focus();
      await page.keyboard.press(behavior === "feed" ? "ArrowUp" : "ArrowLeft");
      await expect(page.getByTestId("two")).toBeFocused();
    });
  }

  test(`${behavior}: same-task authored control tabindex survives activation`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="${behavior}">
        <div focusgrouprow>
          <div tabindex="0" data-testid="one">One
            <button focusgroup="none" data-testid="action">Action</button>
          </div>
          <div tabindex="0" data-testid="two">Two</div>
        </div>
      </div>
      <button data-testid="after">After</button>`,
    );
    await page.getByTestId("two").focus();
    await page.evaluate(() => {
      document
        .querySelector('[data-testid="action"]')
        .setAttribute("tabindex", "-1");
      document.querySelector('[data-testid="one"]').focus();
    });
    await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
    await pressTab(page, project);
    await expect(page.getByTestId("after")).toBeFocused();
  });
}

test("nested focus movement preserves another owner's pending insertion", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="outer">Outer
        <div focusgroup="toolbar" data-testid="inner">
          <button data-testid="one">One</button><button data-testid="two">Two</button>
        </div>
      </div>
    </div>
    <div focusgroup="feed" data-testid="other"><div tabindex="0">Other</div></div>`,
  );
  await page.getByTestId("one").focus();
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="other"]')
      .insertAdjacentHTML(
        "beforeend",
        '<div tabindex="0" data-testid="added">Added</div>',
      );
    document.querySelector('[data-testid="two"]').focus();
  });
  await expect(page.getByTestId("added")).toHaveAttribute("data-fg-item");
  await expect(page.getByTestId("two")).toBeFocused();
});

test("pending shadow host insertion keeps observing later shadow mutations @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed" data-testid="owner">
      <div tabindex="0" data-testid="one">One<button focusgroup="none">Action</button></div>
      <div tabindex="0" data-testid="two">Two<button focusgroup="none">Action</button></div>
    </div>`,
  );
  await page.getByTestId("one").focus();
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).innerHTML =
      '<div tabindex="0" data-testid="shadow-item">Shadow item</div>';
    document.querySelector('[data-testid="owner"]').append(host);
    document.querySelector('[data-testid="two"]').focus();
  });
  await expect(page.getByTestId("shadow-item")).toHaveAttribute("data-fg-item");
  await page.getByTestId("shadow-item").evaluate((el) => {
    el.hidden = true;
  });
  await expect(page.getByTestId("shadow-item")).not.toHaveAttribute(
    "data-fg-item",
  );
});

test("author focus listeners can mutate items during arrow navigation", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One</div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>`,
  );
  await page.getByTestId("one").focus();
  await page.getByTestId("two").evaluate((el) => {
    el.addEventListener(
      "focus",
      () => {
        document.querySelector('[data-testid="one"]').hidden = true;
      },
      { once: true },
    );
  });
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await expect(page.getByTestId("one")).not.toHaveAttribute("data-fg-item");
});

test("custom element reactions preserve author mutations during managed tabindex writes", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <reactive-control tabindex="0" focusgroup="none" data-testid="action">Action</reactive-control>
      </div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("one").focus();
  await page.evaluate(() => {
    customElements.define(
      "reactive-control",
      class extends HTMLElement {
        static observedAttributes = ["tabindex"];
        reacted = false;
        attributeChangedCallback(_name, oldValue, newValue) {
          if (!this.reacted && oldValue === "0" && newValue === "-1") {
            this.reacted = true;
            document.querySelector('[data-testid="one"]').hidden = true;
            document.querySelector('[data-testid="two"]').focus();
          }
        }
      },
    );
    document.querySelector('[data-testid="after"]').focus();
  });
  await expect(page.getByTestId("one")).not.toHaveAttribute("data-fg-item");
  await expect(page.getByTestId("two")).toBeFocused();
  await page.getByTestId("one").evaluate((el) => {
    el.hidden = false;
  });
  await expect(page.getByTestId("one")).toHaveAttribute("data-fg-item");
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "0");
});
