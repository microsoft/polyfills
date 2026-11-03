// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect } from "./utils.js";

for (const mode of ["force", "transition", "native"]) {
  test(`native grid feature policy: ${mode}`, async ({ page }, { project }) => {
    await page.goto("/test.html");
    await page.setContent(`
      <table focusgroup="${mode === "transition" ? "toolbar" : "grid"}">
        <tbody><tr><td tabindex="0" data-testid="one">One</td></tr>
        <tr><td tabindex="0" data-testid="two">Two</td></tr></tbody>
      </table>`);
    await page.evaluate(
      async ({ mode, specifier }) => {
        Object.defineProperty(document.body, "focusGroup", {
          configurable: true,
          value: { supports: () => true },
        });
        globalThis.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__ = mode === "native";
        const { polyfillBodyAndObserve } = await import(specifier);
        polyfillBodyAndObserve();
        await new Promise(requestAnimationFrame);
        if (mode === "transition") {
          document.querySelector("table").setAttribute("focusgroup", "grid");
        }
      },
      {
        mode,
        specifier: project.name.endsWith("Shadowless")
          ? "/build/index-shadowless.mjs"
          : "/build/index.mjs",
      },
    );
    if (mode === "native") {
      await expect(page.getByTestId("one")).not.toHaveAttribute("data-fg-item");
    } else {
      await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
      await page.getByTestId("one").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("two")).toBeFocused();
    }
  });
}
