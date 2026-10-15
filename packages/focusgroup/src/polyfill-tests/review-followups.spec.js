// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("disconnect() is safe on deferred and already disconnected instances", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar" data-testid="toolbar"><button>A</button></div>`,
  );
  const errors = await page.evaluate(
    async (specifier) => {
      const { FocusGroup } = await import(specifier);
      const errors = [];
      const owner = document.querySelector('[data-testid="toolbar"]');
      // A definition that defers to native support never initializes.
      Object.defineProperty(document.body, "focusGroup", {
        configurable: true,
        value: { supports: () => true },
      });
      try {
        new FocusGroup(
          owner,
          {},
          { definition: { behavior: "toolbar" } },
        ).disconnect();
      } catch (error) {
        errors.push(`deferred: ${error.message}`);
      }
      Object.defineProperty(document.body, "focusGroup", {
        configurable: true,
        value: { supports: () => false },
      });
      const decorated = [];
      const fg = new FocusGroup(
        owner,
        {
          items: () => [],
          contains: () => false,
          first: () => null,
        },
        {
          definition: { behavior: "toolbar" },
          decorateOwner: (element, behavior) =>
            decorated.push([element, behavior]),
        },
      );
      try {
        fg.disconnect();
        fg.disconnect();
      } catch (error) {
        errors.push(`twice: ${error.message}`);
      }
      if (decorated.some(([element]) => !element)) {
        errors.push("decorateOwner received a null owner");
      }
      if (
        decorated.length !== 2 ||
        decorated[0][1] !== "toolbar" ||
        decorated[1][1] !== null
      ) {
        errors.push("Expected one decoration and one teardown");
      }
      return errors;
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  expect(errors).toEqual([]);
});

test(
  "focus between controls inside a slotted cell's shadow root updates the grid",
  { tag: "@shadow" },
  async ({ page }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <button data-testid="before">Before</button>
      <div focusgroup="grid manual">
        <x-row focusgrouprow>
          <button slot="a" data-testid="a1">A1</button>
          <button slot="b" data-testid="a2">A2</button>
        </x-row>
      </div>
      <button data-testid="after">After</button>`,
    );
    // Both cells live in one shadow root; their targets are slotted.
    await page.evaluate(async () => {
      document.querySelector("x-row").attachShadow({ mode: "open" }).innerHTML =
        ["a", "b"]
          .map(
            (name) =>
              `<div><slot name="${name}"></slot><button tabindex="-1" focusgroup="none" data-control="${name}">x</button></div>`,
          )
          .join("");
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.getByTestId("a1").focus();
    // Script focus moves between the two cells' shadow-internal controls.
    // The owner only sees the shared host, so the shadow root must report it.
    await page.evaluate(() => {
      const root = document.querySelector("x-row").shadowRoot;
      root.querySelector('[data-control="a"]').focus();
      root.querySelector('[data-control="b"]').focus();
    });
    await page.getByTestId("before").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("a2")).toBeFocused();
  },
);

// Cached views (tabs, `<KeepAlive>`, virtualized lists) detach DOM and
// reinsert it in a later task. `polyfill()` alone does not observe additions,
// so owners torn down while detached must be reinstated when they return.
for (const detachBeforeInit of [false, true]) {
  test(`owners in a detached and reinserted subtree keep working${detachBeforeInit ? " (detached before init)" : ""}`, async ({
    page,
  }, { project }) => {
    await setupPage(page, project, `<main id="host"></main>`);
    const specifier = project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs";
    await page.evaluate(
      async ({ detachBeforeInit, specifier }) => {
        const frame = () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => setTimeout(resolve)),
          );
        const host = document.getElementById("host");
        host.innerHTML = `
        <section id="panel">
          <div focusgroup="feed">
            <article tabindex="0" data-testid="one">
              One
              <div focusgroup="toolbar">
                <button data-testid="a">A</button><button data-testid="b">B</button>
              </div>
            </article>
            <article tabindex="0" data-testid="two">Two</article>
          </div>
        </section>`;
        const { polyfill } = await import(specifier);
        polyfill(host);
        if (!detachBeforeInit) {
          await frame();
        }
        const panel = document.getElementById("panel");
        document.createElement("div").append(panel);
        await frame();
        host.append(panel);
        await frame();
        await frame();
      },
      { detachBeforeInit, specifier },
    );
    await page.getByTestId("one").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("two")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("a")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("b")).toBeFocused();
  });
}
