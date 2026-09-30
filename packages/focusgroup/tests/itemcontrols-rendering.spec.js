// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

for (const behavior of ["feed", "grid manual"]) {
  test(`${behavior}: cosmetic mutations preserve state and CSS sibling visibility rebuilds it`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <style>
        .hide-peer + [data-testid="two"] { visibility: hidden; }
        .hide-controls button { display: none; }
        .cosmetic { color: blue; }
      </style>
      <div focusgroup="${behavior}" data-testid="owner">
        <div focusgrouprow>
          <div tabindex="0" data-testid="one">One
            <button focusgroup="none" data-testid="one-action">Action</button>
          </div>
          <div tabindex="0" data-testid="two">Two
            <button focusgroup="none" data-testid="two-action">Action</button>
          </div>
        </div>
      </div>
      <button data-testid="after">After</button>`,
    );
    await page.getByTestId("two-action").focus();
    await page
      .getByTestId("one")
      .evaluate((el) => el.classList.add("cosmetic"));
    await expect(page.getByTestId("two-action")).toBeFocused();
    await page.getByTestId("after").focus();
    await pressTab(page, project, true);
    await expect(page.getByTestId("two")).toBeFocused();
    await page.getByTestId("after").focus();
    await page
      .getByTestId("one")
      .evaluate((el) => el.classList.add("hide-peer"));
    await expect(page.getByTestId("two")).not.toHaveAttribute("data-fg-item");
    await page
      .getByTestId("one")
      .evaluate((el) => el.classList.remove("hide-peer"));
    await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
    await pressTab(page, project, true);
    await expect(page.getByTestId("one")).toBeFocused();
    await page
      .getByTestId("one")
      .evaluate((el) => el.classList.add("hide-controls"));
    await expect(page.getByTestId("one-action")).toBeHidden();
    await page
      .getByTestId("one")
      .evaluate((el) => el.classList.remove("hide-controls"));
    await pressTab(page, project);
    await expect(page.getByTestId("one-action")).toBeFocused();
  });
}

test("rendering cache invalidates after insertions and discovers newly visible controls", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <style>.concealed { display: none; }</style>
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One</div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>`,
  );
  await page.getByTestId("one").focus();
  await page.getByTestId("two").evaluate((el) => {
    el.insertAdjacentHTML(
      "beforeend",
      '<button focusgroup="none" class="concealed" data-testid="new">New</button>',
    );
  });
  await expect(page.getByTestId("new")).toBeHidden();
  await page
    .getByTestId("new")
    .evaluate((el) => el.classList.remove("concealed"));
  await expect(page.getByTestId("new")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("new")).toBeFocused();
});

for (const [name, markup] of [
  ["button", '<button data-testid="control">Button</button>'],
  ["link", '<a href="#target" data-testid="control">Link</a>'],
  ["input", '<input data-testid="control" value="Text">'],
  ["select", '<select data-testid="control"><option>Option</option></select>'],
  ["textarea", '<textarea data-testid="control">Text</textarea>'],
  [
    "summary",
    '<details><summary data-testid="control">Summary</summary></details>',
  ],
  ["editable", '<div contenteditable data-testid="control">Editable</div>'],
  ["audio", '<audio controls data-testid="control"></audio>'],
  ["video", '<video controls data-testid="control"></video>'],
]) {
  test(`nested owners preserve implicit ${name} eligibility`, async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="feed">
        <div tabindex="0" data-testid="outer">Outer
          <div focusgroup="feed">
            <div tabindex="0" data-testid="inner">Inner
              <div focusgroup="none">${markup}</div>
              <button focusgroup="none" tabindex="-1" data-testid="negative">Negative</button>
              <button focusgroup="none" disabled data-testid="disabled">Disabled</button>
              <a focusgroup="none" data-testid="no-href">Not a link</a>
            </div>
          </div>
        </div>
        <div tabindex="0" data-testid="other">Other</div>
      </div>`,
    );
    await page.getByTestId("other").focus();
    await expect(page.getByTestId("control")).toHaveAttribute("tabindex", "-1");
    await page.getByTestId("inner").focus();
    await expect(page.getByTestId("control")).not.toHaveAttribute("tabindex");
    await expect(page.getByTestId("negative")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await expect(page.getByTestId("disabled")).not.toHaveAttribute("tabindex");
    await expect(page.getByTestId("no-href")).not.toHaveAttribute("tabindex");
    if (!["audio", "video"].includes(name)) {
      await pressTab(page, project);
      await expect(page.getByTestId("control")).toBeFocused();
    }
    await page.getByTestId("other").focus();
    await expect(page.getByTestId("control")).toHaveAttribute("tabindex", "-1");
  });
}
