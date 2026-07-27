// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";

/**
 * Regression tests for https://github.com/microsoft/polyfills/issues/51
 *
 * A custom element attaches its shadow root during upgrade and renders the
 * template later (Lit does this in a microtask), and the component bundle
 * itself often loads after the polyfill. A `focusgroup` element created that
 * way must still be picked up by `polyfillBodyAndObserve()`.
 */

const GROUP = `
  <div focusgroup="toolbar">
    <button data-testid="item1">One</button>
    <button data-testid="item2">Two</button>
    <button data-testid="item3">Three</button>
  </div>`;

/**
 * Installs the polyfill, then runs `render` — so anything it creates comes
 * into existence after `polyfill()` has already walked the document.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').FullProject} project
 * @param {string} html - HTML body content to set before polyfilling
 * @param {string} render - script source, evaluated after polyfilling
 */
async function polyfillThenRender(page, project, html, render) {
  await page.goto("/test.html");
  await page.setContent(html);

  const specifier = project.name.endsWith("Shadowless")
    ? "/build/index-shadowless.mjs"
    : "/build/index.mjs";
  await page.evaluate(async (specifier) => {
    const { polyfillBodyAndObserve } = await import(specifier);
    polyfillBodyAndObserve();
  }, specifier);

  await page.evaluate((render) => {
    const script = document.createElement("script");
    script.textContent = render;
    document.head.append(script);
  }, render);

  // The polyfill defers FocusGroup construction to a rAF callback.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
}

test.describe("focusgroup rendered into a shadow root after polyfilling", () => {
  test(
    "is polyfilled when the host upgrades after polyfilling",
    {
      tag: "@shadow",
    },
    async ({ page }, { project }) => {
      await polyfillThenRender(
        page,
        project,
        "<x-group></x-group>",
        `customElements.define("x-group", class extends HTMLElement {
         connectedCallback() {
           const root = this.attachShadow({ mode: "open" });
           // Lit renders its template in a microtask after the upgrade.
           queueMicrotask(() => { root.innerHTML = \`${GROUP}\`; });
         }
       });`,
      );

      await page.getByTestId("item1").focus();
      await page.keyboard.press("ArrowRight");

      await expect(page.getByTestId("item2")).toBeFocused();
    },
  );

  test(
    "is polyfilled when the shadow root already exists",
    {
      tag: "@shadow",
    },
    async ({ page }, { project }) => {
      await polyfillThenRender(
        page,
        project,
        `<div id="host"><template shadowrootmode="open"></template></div>`,
        `document.getElementById("host").shadowRoot.innerHTML = \`${GROUP}\`;`,
      );

      await page.getByTestId("item1").focus();
      await page.keyboard.press("ArrowRight");

      await expect(page.getByTestId("item2")).toBeFocused();
    },
  );
});

test("the polyfill root is not an owner unless it has a focusgroup attribute", async ({
  page,
}, { project }) => {
  await polyfillThenRender(page, project, GROUP, "");

  const owners = await page.evaluate(async () => {
    const { state } = await import("/build/global-state.mjs");
    return [...(state.m?.keys() ?? [])].map((el) => el.localName);
  });

  expect(owners).toEqual(["div"]);
});
