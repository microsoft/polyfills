// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

const items = `
  <div tabindex="0" data-testid="one">One
    <button focusgroup="none" data-testid="action-one">Action one</button>
  </div>
  <div tabindex="0" data-testid="two">Two
    <button focusgroup="none" data-testid="action-two">Action two</button>
  </div>`;

test("reverse grid entry activates controls before the next Tab", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="grid manual"><div focusgrouprow>${items}</div></div>
    <button data-testid="after">After</button>`,
  );
  await page.getByTestId("after").focus();
  await pressTab(page, project, true);
  await expect(page.getByTestId("one")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("action-one")).toBeFocused();
});

for (const redirect of ["item", "control", "outside"]) {
  test(`arrow focus redirection to ${redirect} keeps filtering and memory consistent`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<button data-testid="before">Before</button>
      <div focusgroup="feed">
        ${["one", "two", "three"]
          .map(
            (name) => `<article tabindex="0" data-testid="${name}">${name}
              <button focusgroup="none" data-testid="${name}-control">Action</button>
            </article>`,
          )
          .join("")}
      </div><button data-testid="outside">Outside</button>`,
    );
    await page.getByTestId("two").evaluate((element, redirect) => {
      const target =
        redirect === "item"
          ? "three"
          : redirect === "control"
            ? "three-control"
            : "outside";
      element.addEventListener("focus", () =>
        document.querySelector(`[data-testid="${target}"]`).focus(),
      );
    }, redirect);
    await page.getByTestId("one").focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByTestId(
        redirect === "item"
          ? "three"
          : redirect === "control"
            ? "three-control"
            : "outside",
      ),
    ).toBeFocused();
    await expect(page.getByTestId("two-control")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    if (redirect !== "outside") {
      await expect(page.getByTestId("three-control")).not.toHaveAttribute(
        "tabindex",
        "-1",
      );
      await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
      await page.getByTestId("before").focus();
      await pressTab(page, project);
      await expect(page.getByTestId("three")).toBeFocused();
    } else {
      await expect(page.getByTestId("three-control")).toHaveAttribute(
        "tabindex",
        "-1",
      );
    }
  });
}

for (const late of [false, true]) {
  test(`overlapping observers preserve nested roving tabindex, late=${late}`, async ({
    page,
  }, { project }) => {
    const toolbar = `<div focusgroup="toolbar" data-testid="toolbar">
      <button data-testid="a">A</button><button data-testid="b">B</button></div>`;
    await setupPage(
      page,
      project,
      `<div focusgroup="feed"><div tabindex="0" data-testid="one">One${late ? "" : toolbar}</div>
      <div tabindex="0">Two</div></div><button data-testid="after">After</button>`,
    );
    if (late) {
      await page.getByTestId("one").evaluate(
        async (el, { markup, specifier }) => {
          el.insertAdjacentHTML("beforeend", markup);
          const { polyfill } = await import(specifier);
          polyfill(el);
          await new Promise(requestAnimationFrame);
        },
        {
          markup: toolbar,
          specifier: project.name.endsWith("Shadowless")
            ? "/build/index-shadowless.mjs"
            : "/build/index.mjs",
        },
      );
    }
    await page.getByTestId("b").focus();
    await page.getByTestId("a").evaluate(async (el) => {
      el.setAttribute("tabindex", "0");
      await new Promise(requestAnimationFrame);
    });
    await page.getByTestId("after").focus();
    await page.getByTestId("one").focus();
    await expect(page.getByTestId("a")).toHaveAttribute("tabindex", "-1");
    await expect(page.getByTestId("b")).toHaveAttribute("tabindex", "0");
    await pressTab(page, project);
    await expect(page.getByTestId("b")).toBeFocused();
  });
}
