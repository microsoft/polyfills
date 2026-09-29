// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab } from "./utils.js";

test("native toolbar without itemcontrols uses the modifier polyfill", async ({
  page,
}, testInfo) => {
  await page.goto("/test.html");
  const detection = await page.evaluate(() => {
    const supports = document.body.focusGroup?.supports;
    const toolbar =
      supports?.call(document.body.focusGroup, "toolbar") ?? false;
    const itemcontrols =
      supports?.call(document.body.focusGroup, "itemcontrols") ?? false;
    return { toolbar, itemcontrols, stubbed: !toolbar || itemcontrols };
  });
  testInfo.annotations.push({
    type: "native-focusgroup",
    description: JSON.stringify(detection),
  });
  console.log(`native-focusgroup: ${JSON.stringify(detection)}`);
  await page.setContent(`
    <div focusgroup="toolbar" data-testid="native">
      <button data-testid="native-one">Native one</button>
      <button data-testid="native-two">Native two</button>
    </div>
    <div focusgroup="toolbar itemcontrols">
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="one-action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two
        <button focusgroup="none" data-testid="two-action">Action</button>
      </div>
    </div>
    <button data-testid="after">After</button>`);
  // Exercise the V1-only policy even on a newer Canary with itemcontrols,
  // or on another engine without native focusgroup.
  await page.evaluate(
    async ({ specifier, stubbed }) => {
      if (stubbed) {
        Object.defineProperty(document.body, "focusGroup", {
          configurable: true,
          value: { supports: (token) => token === "toolbar" },
        });
      }
      const { polyfill } = await import(specifier);
      polyfill();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    {
      specifier: testInfo.project.name.endsWith("Shadowless")
        ? "/build/index-shadowless.mjs"
        : "/build/index.mjs",
      stubbed: detection.stubbed,
    },
  );
  await expect(page.getByTestId("native-one")).not.toHaveAttribute(
    "data-fg-item",
  );
  await expect(page.getByTestId("two")).toHaveAttribute("data-fg-item");
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("two-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await pressTab(page, testInfo.project);
  await expect(page.getByTestId("one-action")).toBeFocused();
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("two")).toBeFocused();
  await pressTab(page, testInfo.project);
  await expect(page.getByTestId("two-action")).toBeFocused();
  await pressTab(page, testInfo.project);
  await expect(page.getByTestId("after")).toBeFocused();
  expect(
    await page.evaluate(
      () => globalThis.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__,
    ),
  ).toBeUndefined();
});
