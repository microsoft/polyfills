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

for (const behavior of ["feed", "grid manual"]) {
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

test("assigned controls preserve same-value author writes and reassign subscriptions @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<x-feed><template shadowrootmode="open">
      <div focusgroup="feed">
        <article tabindex="0" data-testid="one">One<div focusgroup="none"><slot name="one"></slot></div></article>
        <article tabindex="0" data-testid="two">Two<div focusgroup="none"><slot name="two"></slot></div></article>
      </div></template>
      <button slot="one" data-testid="control">Action</button>
    </x-feed>`,
  );
  await expect(page.getByTestId("control")).toHaveAttribute("tabindex", "-1");
  await page
    .getByTestId("control")
    .evaluate((element) => element.setAttribute("tabindex", "-1"));
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("control")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("control").evaluate(async (element) => {
    element.slot = "two";
    await new Promise(requestAnimationFrame);
    element.removeAttribute("tabindex");
    await new Promise(requestAnimationFrame);
  });
  await page.getByTestId("two").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("control")).toBeFocused();
});

test("assigned subtree observers drain records and release subscriptions @shadow", async ({
  page,
}, { project }) => {
  await setupPage(page, project, "<x-host></x-host>");
  const results = await page.evaluate(async () => {
    const { createMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );
    const host = document.querySelector("x-host");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      '<div id="scope"><slot></slot></div><slot name="outside"></slot>';
    const assigned = document.createElement("div");
    assigned.innerHTML = "<button>Action</button>";
    host.append(assigned);
    await new Promise(requestAnimationFrame);
    const button = assigned.firstElementChild;
    const delivered = [];
    const observer = createMutationObserver((records) =>
      delivered.push(...records),
    );
    observer.observe(root.getElementById("scope"), {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["tabindex"],
    });
    button.setAttribute("tabindex", "-1");
    const captured = observer.takeRecords().map((record) => record.oldValue);
    assigned.slot = "outside";
    await new Promise(requestAnimationFrame);
    delivered.length = 0;
    button.setAttribute("tabindex", "0");
    await new Promise(requestAnimationFrame);
    const afterReassignment = delivered.length;
    assigned.slot = "";
    await new Promise(requestAnimationFrame);
    delivered.length = 0;
    button.setAttribute("tabindex", "2");
    await new Promise(requestAnimationFrame);
    const reconnected = delivered.map((record) => record.oldValue);
    observer.disconnect();
    delivered.length = 0;
    button.setAttribute("tabindex", "3");
    await new Promise(requestAnimationFrame);
    return {
      captured,
      afterReassignment,
      reconnected,
      afterDisconnect: delivered.length,
    };
  });
  expect(results).toEqual({
    captured: [null],
    afterReassignment: 0,
    reconnected: ["0"],
    afterDisconnect: 0,
  });
});

for (const action of ["focus", "click"]) {
  test(`shadow-internal ${action} updates owner controls and memory @shadow`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="feed"><div><template shadowrootmode="open">${items}</template></div></div>
      <button data-testid="after">After</button>`,
    );
    await page.getByTestId("one").focus();
    await page.getByTestId("action-two")[action]();
    await expect(page.getByTestId("action-one")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await expect(page.getByTestId("action-two")).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.getByTestId("after").focus();
    await pressTab(page, project, true);
    await expect(page.getByTestId("two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("action-two")).toBeFocused();
  });
}

test("new shadow roots reconcile focus and release listeners on teardown @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" data-testid="owner"><div tabindex="0">Initial</div></div>`,
  );
  await page.getByTestId("owner").evaluate(async (el, markup) => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).innerHTML = markup;
    el.replaceChildren(host);
    await new Promise(requestAnimationFrame);
  }, items);
  await page.getByTestId("one").focus();
  await page.getByTestId("action-two").focus();
  await expect(page.getByTestId("action-one")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.getByTestId("action-two")).not.toHaveAttribute(
    "tabindex",
    "-1",
  );
  await page.getByTestId("owner").evaluate(async (el) => {
    const group = globalThis.__FOCUSGROUP_POLYFILL__.m.get(el);
    group.disconnect();
    await new Promise(requestAnimationFrame);
  });
  await page.getByTestId("one").focus();
  await page.getByTestId("action-two").focus();
  await expect(page.getByTestId("action-one")).not.toHaveAttribute("tabindex");
  await expect(page.getByTestId("action-two")).not.toHaveAttribute("tabindex");
});
