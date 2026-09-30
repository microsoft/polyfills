// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

test("nested removed groups restore authored items before reinsertion", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <section data-testid="wrapper">
      <div focusgroup="feed">
        <div tabindex="0" data-testid="outer">Outer
          <div focusgroup="feed inline"><button data-testid="one">One</button><button data-testid="two">Two</button></div>
        </div>
      </div>
    </section>`,
  );
  const state = await page.evaluate(
    async (specifier) => {
      const { polyfillBodyAndObserve } = await import(specifier);
      polyfillBodyAndObserve();
      const wrapper = document.querySelector('[data-testid="wrapper"]');
      const one = wrapper.querySelector('[data-testid="one"]');
      one.setAttribute("tabindex", "0");
      wrapper.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = {
        markers: wrapper.querySelectorAll(
          "[data-fg-item], [data-fg-ati], [data-fg-ir]",
        ).length,
        first: one.getAttribute("tabindex"),
        second: wrapper
          .querySelector('[data-testid="two"]')
          .getAttribute("tabindex"),
      };
      document.body.append(wrapper);
      return result;
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  expect(state).toEqual({ markers: 0, first: "0", second: null });
  await expect(page.getByTestId("two")).toHaveAttribute("data-fg-item");
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("two")).toBeFocused();
});

test("connected owner moves retain the live instance", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
    <div data-testid="wrapper"><div focusgroup="feed" data-testid="owner">
      <div tabindex="0" data-testid="one">One</div><div tabindex="0" data-testid="two">Two</div>
    </div></div><section data-testid="destination"></section>`,
  );
  expect(
    await page.evaluate(async () => {
      const owner = document.querySelector('[data-testid="owner"]');
      const instance = globalThis.__FOCUSGROUP_POLYFILL__.m.get(owner);
      document.querySelector('[data-testid="wrapper"]').remove();
      document.querySelector('[data-testid="destination"]').append(owner);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return globalThis.__FOCUSGROUP_POLYFILL__.m.get(owner) === instance;
    }),
  ).toBe(true);
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
});

for (const behavior of ["feed", "grid manual"]) {
  test(`${behavior}: detached reparenting cleans up and reinsertion restores navigation`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div data-testid="wrapper"><div focusgroup="${behavior}" data-testid="owner">
        <div focusgrouprow>
          <div tabindex="0" data-testid="one">One<button focusgroup="none" data-testid="action">Action</button></div>
          <div tabindex="0" data-testid="two">Two</div>
        </div>
      </div></div>`,
    );
    await page.getByTestId("two").focus();
    const detached = await page.evaluate(
      async (specifier) => {
        const { polyfillBodyAndObserve } = await import(specifier);
        polyfillBodyAndObserve();
        const owner = document.querySelector('[data-testid="owner"]');
        document.querySelector('[data-testid="wrapper"]').remove();
        const fragment = document.createDocumentFragment();
        fragment.append(owner);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const state = globalThis.__FOCUSGROUP_POLYFILL__;
        const result = {
          owners: state.m.size,
          observers: state.p.size,
          controls: state.c.size,
          markers: owner.querySelectorAll(
            "[data-fg-item], [data-fg-ati], [data-fg-ir]",
          ).length,
          role: owner.getAttribute("role"),
          tabindex: owner
            .querySelector('[data-testid="one"]')
            .getAttribute("tabindex"),
        };
        document.body.append(fragment);
        return result;
      },
      project.name.endsWith("Shadowless")
        ? "/build/index-shadowless.mjs"
        : "/build/index.mjs",
    );
    expect(detached).toEqual({
      owners: 0,
      observers: 0,
      controls: 0,
      markers: 0,
      role: null,
      tabindex: "0",
    });
    await expect(page.getByTestId("one")).toHaveAttribute("data-fg-item");
    await page.getByTestId("one").focus();
    await pressTab(page, project);
    await expect(page.getByTestId("action")).toBeFocused();
    await page.getByTestId("one").focus();
    await page.keyboard.press(behavior === "feed" ? "ArrowDown" : "ArrowRight");
    await expect(page.getByTestId("two")).toBeFocused();
  });

  test(`${behavior}: slotted control reassignment restores filtering @shadow`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div id="host">
        <button slot="controls" focusgroup="none" data-testid="action">Action</button>
        <template shadowrootmode="open">
          <div focusgroup="${behavior}">
            <div focusgrouprow>
              <div tabindex="0" data-testid="one">One<slot name="controls"></slot></div>
              <div tabindex="0" data-testid="two">Two</div>
            </div>
          </div>
          <slot name="outside"></slot>
        </template>
      </div>`,
    );
    await page.getByTestId("two").focus();
    await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
    await page.getByTestId("action").evaluate((el) => {
      el.slot = "outside";
    });
    await expect(page.getByTestId("action")).not.toHaveAttribute("tabindex");
    await page.getByTestId("action").evaluate((el) => {
      el.slot = "controls";
    });
    await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
    await page.getByTestId("one").focus();
    await pressTab(page, project);
    await expect(page.getByTestId("action")).toBeFocused();
  });
}

for (const behavior of ["feed", "grid manual"]) {
  test(`${behavior}: slotted items leave no stale decorations and can return @shadow`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
    <div id="host">
      <div tabindex="0" slot="one" data-testid="one">One</div>
      <div tabindex="0" slot="two" data-testid="two">Two</div>
      <template shadowrootmode="open">
        <div focusgroup="${behavior}">
          <div focusgrouprow><div><slot name="one"></slot></div><div><slot name="two"></slot></div></div>
        </div>
        <slot name="outside"></slot>
      </template>
    </div>`,
    );
    await page.getByTestId("one").focus();
    await page.getByTestId("two").evaluate((el) => {
      el.slot = "outside";
    });
    await expect(page.getByTestId("two")).not.toHaveAttribute("data-fg-item");
    await expect(page.getByTestId("two")).not.toHaveAttribute("data-fg-ati");
    await expect(page.getByTestId("two")).not.toHaveAttribute("role");
    await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "0");
    await page.getByTestId("two").evaluate((el) => {
      el.slot = "two";
    });
    await expect(page.getByTestId("two")).toHaveAttribute("data-fg-item");
    await page.getByTestId("one").focus();
    await page.keyboard.press(behavior === "feed" ? "ArrowDown" : "ArrowRight");
    await expect(page.getByTestId("two")).toBeFocused();
  });
}

test("shadow observers stop reporting slot assignments after disconnect @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div id="host"><span slot="one" id="assigned">Item</span>
      <template shadowrootmode="open"><div id="owner"><slot name="one"></slot></div><slot name="two"></slot></template>
    </div>`,
  );
  expect(
    await page.evaluate(async () => {
      const { createMutationObserver } = await import(
        "/build/shadow-utils/mutation-observer.mjs"
      );
      let notifications = 0;
      const owner = document
        .querySelector("#host")
        .shadowRoot.querySelector("#owner");
      const observer = createMutationObserver(() => {
        notifications++;
      });
      observer.observe(owner, { subtree: true, childList: true });
      document.querySelector("#assigned").slot = "two";
      await new Promise((resolve) => setTimeout(resolve, 0));
      const before = notifications;
      observer.disconnect();
      document.querySelector("#assigned").slot = "one";
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { before, after: notifications };
    }),
  ).toEqual({ before: 1, after: 1 });
});

test("grid role inference preserves button semantics", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="grid manual">
      <div focusgrouprow><button data-testid="button">Action</button><div tabindex="0" data-testid="cell">Cell</div></div>
    </div>`,
  );
  await expect(page.getByTestId("button")).toHaveComputedRole("button");
  await expect(page.getByTestId("button")).not.toHaveAttribute("role");
  await expect(page.getByTestId("cell")).toHaveComputedRole("gridcell");
  // Exercise the shared helper as well as the grid's coordinate decorator.
  await page.getByTestId("button").evaluate(async (el) => {
    const { inferRole } = await import("/build/utils.mjs");
    inferRole(el, "grid", "child");
  });
  await expect(page.getByTestId("button")).not.toHaveAttribute("role");
  await page.getByTestId("button").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("cell")).toBeFocused();
});
