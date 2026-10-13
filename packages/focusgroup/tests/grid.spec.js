// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

for (const manual of [false, true]) {
  for (const attribute of ["hidden", "style", "class", "inert"]) {
    test(`${manual ? "manual" : "automatic"} grids resolve ${attribute} exclusions before rectangularity`, async ({
      page,
    }, { project }) => {
      const rowTag = manual ? "div focusgrouprow" : "tr";
      const rowEnd = manual ? "div" : "tr";
      const cellTag = manual ? "div" : "td";
      const rows = ["a", "b", "c"]
        .map(
          (row) => `<${rowTag} data-testid="${row}">
          ${[1, 2, 3]
            .map(
              (col) =>
                `<${cellTag} tabindex="0" data-testid="${row}${col}">${row}${col}</${cellTag}>`,
            )
            .join("")}</${rowEnd}>`,
        )
        .join("");
      await setupPage(
        page,
        project,
        `<style>.unavailable { display: none; }</style>
        ${manual ? '<div focusgroup="grid manual">' : '<table focusgroup="grid"><tbody>'}
        ${rows}
        ${manual ? "</div>" : "</tbody></table>"}`,
      );
      const exclude = async (ids, excluded) => {
        await page.evaluate(
          ({ ids, excluded, attribute }) => {
            for (const id of ids) {
              const el = document.querySelector(`[data-testid="${id}"]`);
              if (excluded) {
                el.setAttribute(
                  attribute,
                  attribute === "style"
                    ? "display: none"
                    : attribute === "class"
                      ? "unavailable"
                      : "",
                );
              } else {
                el.removeAttribute(attribute);
              }
            }
            return new Promise(requestAnimationFrame);
          },
          { ids, excluded, attribute },
        );
      };
      const navigate = async (from, key, to) => {
        await page.getByTestId(from).focus();
        await page.keyboard.press(key);
        await expect(page.getByTestId(to)).toBeFocused();
      };

      await navigate("a1", "ArrowRight", "a2");
      await exclude(["a2", "b2", "c2"], true);
      await navigate("a1", "ArrowRight", "a3");
      await navigate("a3", "ArrowDown", "b3");
      await exclude(["b"], true);
      await navigate("a3", "ArrowDown", "c3");
      await exclude(["b"], false);
      await navigate("a3", "ArrowDown", "b3");

      // Restoring only one row's middle cell makes the shape ragged.
      await exclude(["b2"], false);
      await navigate("a1", "ArrowRight", "a1");
      await exclude(["a2", "c2"], false);
      await navigate("a1", "ArrowRight", "a2");

      // An empty rendered row is invalid; an excluded row contributes nothing.
      await exclude(["b1", "b2", "b3"], true);
      await navigate("a1", "ArrowRight", "a1");
      await exclude(["b"], true);
      await navigate("a1", "ArrowDown", "c1");
    });
  }
}

// Native-only Canary 157.0.8102.0 reports grid/manual support but does not
// perform the directional operations in these fixtures. Keep the V2
// expectations visible rather than skipping or matching the observed no-op:
// https://open-ui.org/components/focusgroup-v2.explainer/#grid-directional-navigation
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

  await expect(page.getByTestId("a1")).toHaveComputedRole("gridcell");
  await page.getByTestId("a2").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("b1")).toBeFocused();
  await expect(page.locator("[focusgrouprow]").first()).toHaveComputedRole(
    "row",
  );
});

test("manual grids discover rows and cells in shadow roots @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <template shadowrootmode="open">
          <div focusgrouprow>
            <button data-testid="a1">A1</button><button data-testid="a2">A2</button>
          </div>
          <div focusgrouprow>
            <button data-testid="b1">B1</button><button data-testid="b2">B2</button>
          </div>
        </template>
      </div>
    `,
  );

  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("b1")).toBeFocused();
});

test("manual grids discover slotted rows and cells @shadow", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <template shadowrootmode="open"><slot></slot></template>
        <div focusgrouprow>
          <template shadowrootmode="open"><slot></slot></template>
          <button data-testid="a1">A1</button><button data-testid="a2">A2</button>
        </div>
        <div focusgrouprow>
          <template shadowrootmode="open"><slot></slot></template>
          <button data-testid="b1">B1</button><button data-testid="b2">B2</button>
        </div>
      </div>
    `,
  );

  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("b2")).toBeFocused();
});

test("a disabled sole cell target invalidates the grid", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow>
          <button data-testid="a1">A1</button>
          <button data-testid="a2" disabled>A2</button>
          <button data-testid="a3">A3</button>
        </div>
      </div>
    `,
  );

  // A disabled control is not a valid candidate. With no other candidate in
  // that cell, the grid has an empty cell and is invalid — none of the
  // items should participate in grid navigation.
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a1")).toBeFocused();
});

test("a disabled control alongside a valid target still yields a single candidate", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow>
          <button data-testid="a1">A1</button>
          <div data-testid="a2-cell"><button disabled>Disabled</button><button data-testid="a2">A2</button></div>
        </div>
      </div>
    `,
  );

  // The disabled descendant should not count as a candidate, so the cell
  // still resolves to its single valid target.
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
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

test("a focusable descendant outside the resolved cell targets invalidates the grid", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow>
          <button data-testid="a1">A1</button>
          <div data-testid="a2-cell">
            <span data-testid="stray" tabindex="0">Stray</span>
            <button data-testid="a2">A2</button>
          </div>
        </div>
      </div>
    `,
  );

  // "stray" is keyboard-focusable, positive tabindex, and not the resolved
  // single candidate for its cell (a2 is). A full-scope walk should find it
  // and invalidate the whole grid rather than silently ignoring it.
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a1")).toBeFocused();
});

test("a focusgrouprow marker outside the enrolled rows invalidates a manual grid", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow>
          <button data-testid="a1">A1</button>
          <button data-testid="a2">A2</button>
        </div>
        <div>
          <div focusgrouprow>
            <button data-testid="b1">B1</button>
          </div>
        </div>
      </div>
    `,
  );

  // The nested focusgrouprow marker is not one of the top-level enrolled
  // rows in the resolved topology, so the whole grid should be invalidated.
  await page.getByTestId("a1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("a1")).toBeFocused();
});

test("a negative-tabindex descendant can initiate navigation from its cell without being a destination", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="grid manual">
        <div focusgrouprow>
          <div data-testid="a1-cell"><span data-testid="a1-source" tabindex="-1">Source</span><button data-testid="a1">A1</button></div>
          <button data-testid="a2">A2</button>
        </div>
      </div>
    `,
  );

  await page.getByTestId("a1-source").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("a2")).toBeFocused();
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

test("removed grid rows return to normal sequential navigation", async ({
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
    .locator("[focusgrouprow]")
    .last()
    .evaluate((row) => {
      row.remove();
      document.body.append(row.firstElementChild);
    });
  await page.getByTestId("a1").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("b1")).toBeFocused();
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
            <td tabindex="0" data-testid="other">
              <table><tbody><tr><td tabindex="0" data-testid="nested">Nested</td></tr></tbody></table>
            </td>
          </tr>
        </tbody>
      </table>
    `,
  );

  await page.getByTestId("outer").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("other")).toBeFocused();
  await page.getByTestId("nested").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("nested")).toBeFocused();
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
