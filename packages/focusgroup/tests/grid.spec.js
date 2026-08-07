// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("native tables support two-dimensional navigation", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <table role="grid" focusgroup="grid">
        <tbody>
          <tr><td tabindex="0" data-testid="a1">A1</td><td tabindex="0" data-testid="a2">A2</td></tr>
          <tr><td tabindex="0" data-testid="b1">B1</td><td tabindex="0" data-testid="b2">B2</td></tr>
        </tbody>
      </table>
    `,
  );

  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("b2")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("b1")).toBeFocused();
});

test("manual grids enroll focusgrouprow rows", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual flow">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div><div tabindex="0" data-testid="a2">A2</div></div>
        <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div><div tabindex="0" data-testid="b2">B2</div></div>
      </div>
    `,
  );

  await expect(page.getByTestId("a1")).toHaveAttribute("role", "gridcell");
  await page.getByTestId("a2").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("b1")).toBeFocused();
  await expect(page.locator("[focusgrouprow]").first()).toHaveAttribute(
    "role",
    "row",
  );
});

test.describe("grid edge behavior", () => {
  for (const [modifier, expected] of [
    ["rowwrap", "a1"],
    ["colwrap", "a1"],
    ["rowflow", "b1"],
    ["colflow", "a2"],
  ]) {
    test(`${modifier} resolves the corresponding edge`, async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
          <div focusgroup="grid manual ${modifier}">
            <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div><div tabindex="0" data-testid="a2">A2</div></div>
            <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div><div tabindex="0" data-testid="b2">B2</div></div>
          </div>
        `,
      );

      const source =
        modifier === "rowwrap" || modifier === "rowflow" ? "a2" : "b1";
      const key =
        modifier === "rowwrap" || modifier === "rowflow"
          ? "ArrowRight"
          : "ArrowDown";
      await page.getByTestId(source).focus();
      await page.keyboard.press(key);
      await expect(page.getByTestId(expected)).toBeFocused();
    });
  }

  test("default grid edges are hard", async ({ page }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div focusgroup="grid manual">
          <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div><div tabindex="0" data-testid="a2">A2</div></div>
          <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div><div tabindex="0" data-testid="b2">B2</div></div>
        </div>
      `,
    );

    await page.getByTestId("a2").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("a2")).toBeFocused();
  });

  test("Ctrl+Home and Ctrl+End target the grid bounds", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `
        <table role="grid" focusgroup="grid">
          <tbody>
            <tr><td tabindex="0" data-testid="a1">A1</td><td tabindex="0" data-testid="a2">A2</td></tr>
            <tr><td tabindex="0" data-testid="b1">B1</td><td tabindex="0" data-testid="b2">B2</td></tr>
          </tbody>
        </table>
      `,
    );

    await page.getByTestId("a1").focus();
    await page.keyboard.press("Control+End");
    await expect(page.getByTestId("b2")).toBeFocused();
    await page.keyboard.press("Control+Home");
    await expect(page.getByTestId("a1")).toBeFocused();
  });
});

test("invalid ragged grids do not take over navigation", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div><div tabindex="0" data-testid="a2">A2</div></div>
        <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div></div>
      </div>
    `,
  );

  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a1")).toBeFocused();
  await expect(page.getByTestId("a2")).toHaveAttribute("tabindex", "0");
});

test("spanned tables are rejected as grid topology", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <table role="grid" focusgroup="grid">
        <tbody>
          <tr><td colspan="2" tabindex="0" data-testid="spanned">Spanned</td></tr>
          <tr><td tabindex="0" data-testid="b1">B1</td><td tabindex="0" data-testid="b2">B2</td></tr>
        </tbody>
      </table>
    `,
  );

  await page.getByTestId("spanned").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("spanned")).toBeFocused();
  await expect(page.getByTestId("spanned")).toHaveAttribute("tabindex", "0");
});

test("grid state is rebuilt after adding a row", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div></div>
      </div>
    `,
  );

  await page.locator("[focusgrouprow]").evaluate((row) => {
    const next = document.createElement("div");
    next.setAttribute("focusgrouprow", "");
    next.innerHTML = '<div tabindex="0" data-testid="b1">B1</div>';
    row.parentElement.append(next);
  });
  await expect(page.getByTestId("b1")).toHaveAttribute("data-fg-item", "");
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("b1")).toBeFocused();
});

test("editable grid targets keep their native arrow-key behavior", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow><input tabindex="0" data-testid="input"></div>
        <div focusgrouprow><input tabindex="0" data-testid="other"></div>
      </div>
    `,
  );

  await page.getByTestId("input").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("input")).toBeFocused();
});

test("grid decoration is cleaned up after removing a row", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div></div>
        <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div></div>
      </div>
    `,
  );

  await page
    .locator("[focusgrouprow]")
    .last()
    .evaluate((row) => {
      window.removedCell = row.firstElementChild;
      row.remove();
    });
  await expect
    .poll(() =>
      page.evaluate(() => [
        window.removedCell.getAttribute("data-fg-item"),
        window.removedCell.getAttribute("tabindex"),
      ]),
    )
    .toEqual([null, "0"]);
});

test("author tabindex changes are preserved during reconciliation", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div></div>
        <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div></div>
      </div>
    `,
  );

  await page
    .getByTestId("b1")
    .evaluate((cell) => cell.setAttribute("tabindex", "-1"));
  await expect(page.getByTestId("b1")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("a1")).toBeFocused();
});

test("nested tables do not become outer-grid rows", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <table role="grid" focusgroup="grid">
        <tbody>
          <tr>
            <td tabindex="0" data-testid="outer">Outer</td>
            <td tabindex="0">
              <table><tbody><tr><td tabindex="0" data-testid="nested">Nested</td></tr></tbody></table>
            </td>
          </tr>
        </tbody>
      </table>
    `,
  );

  await expect(page.getByTestId("outer")).toHaveAttribute("data-fg-item", "");
  await expect(page.getByTestId("nested")).not.toHaveAttribute("data-fg-item");
});

test("vertical writing modes map physical arrows to grid axes", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div style="writing-mode: vertical-rl" focusgroup="grid manual">
        <div focusgrouprow><div tabindex="0" data-testid="a1">A1</div><div tabindex="0" data-testid="a2">A2</div></div>
        <div focusgrouprow><div tabindex="0" data-testid="b1">B1</div><div tabindex="0" data-testid="b2">B2</div></div>
      </div>
    `,
  );

  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("b1")).toBeFocused();
});
