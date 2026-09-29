// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

for (const behavior of ["feed", "grid manual"]) {
  for (const value of ["0", "-1", null]) {
    test(`${behavior}: removal preserves pending authored control tabindex ${value}`, async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="${behavior}" data-testid="owner">
          <div focusgrouprow>
            <div tabindex="0">One
              <button focusgroup="none" tabindex="2" data-testid="action">Action</button>
            </div>
            <div tabindex="0" data-testid="two">Two</div>
          </div>
        </div>`,
      );
      await page.getByTestId("two").focus();
      expect(
        await page.evaluate(async (value) => {
          const action = document.querySelector('[data-testid="action"]');
          if (value === null) {
            action.removeAttribute("tabindex");
          } else {
            action.setAttribute("tabindex", value);
          }
          document.querySelector('[data-testid="owner"]').remove();
          await new Promise((resolve) => setTimeout(resolve, 0));
          return {
            tabindex: action.getAttribute("tabindex"),
            controlled: globalThis.__FOCUSGROUP_POLYFILL__.c.has(action),
            owners: globalThis.__FOCUSGROUP_POLYFILL__.m.size,
          };
        }, value),
      ).toEqual({ tabindex: value, controlled: false, owners: 0 });
    });
  }
}

for (const removed of ["outer", "inner"]) {
  test(`removing ${removed} preserves pending tabindex on shared nested controls`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="feed" data-testid="outer">
        <div tabindex="0">Outer
          <div focusgroup="feed" data-testid="inner">
            <div tabindex="0">Inner
              <button focusgroup="none" tabindex="2" data-testid="action">Action</button>
            </div>
            <div tabindex="0" data-testid="next">Next</div>
          </div>
        </div>
        <div tabindex="0" data-testid="other">Other</div>
      </div>`,
    );
    await page.getByTestId("other").focus();
    expect(
      await page.evaluate(async (removed) => {
        const action = document.querySelector('[data-testid="action"]');
        action.setAttribute("tabindex", "3");
        // Queue capture before the global removal observer disconnects either owner.
        document.querySelector('[data-testid="next"]').focus();
        document.querySelector(`[data-testid="${removed}"]`).remove();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return {
          tabindex: action.getAttribute("tabindex"),
          controlled: globalThis.__FOCUSGROUP_POLYFILL__.c.has(action),
        };
      }, removed),
    ).toEqual({ tabindex: "3", controlled: false });
  });
}

test("native behavior selected before installation releases its reservation", async ({
  page,
}, { project }) => {
  await page.goto("/test.html");
  await page.setContent(`
    <div focusgroup="feed" data-testid="owner">
      <div tabindex="0" data-testid="one">One</div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>`);
  const reserved = await page.evaluate(
    async (specifier) => {
      Object.defineProperty(document.body, "focusGroup", {
        configurable: true,
        value: { supports: (token) => token === "toolbar" },
      });
      const { polyfillBodyAndObserve } = await import(specifier);
      polyfillBodyAndObserve();
      const owner = document.querySelector('[data-testid="owner"]');
      const reserved = globalThis.__FOCUSGROUP_POLYFILL__.m.get(owner) === null;
      owner.setAttribute("focusgroup", "toolbar");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return reserved;
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  expect(reserved).toBe(true);
  await expect(page.getByTestId("one")).not.toHaveAttribute("data-fg-item");
  expect(
    await page.evaluate(() => globalThis.__FOCUSGROUP_POLYFILL__.m.size),
  ).toBe(0);
  await page
    .getByTestId("owner")
    .evaluate((el) => el.setAttribute("focusgroup", "feed"));
  await expect(page.getByTestId("one")).toHaveAttribute("data-fg-item");
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
});
