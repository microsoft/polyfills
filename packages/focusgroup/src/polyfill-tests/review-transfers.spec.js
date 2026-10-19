// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

for (const pendingAuthorValue of [null, "5"]) {
  test(`destination-first transfer preserves grid decoration and authored tabindex (${pendingAuthorValue})`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="toolbar" id="source">
      <button>Source start</button><button tabindex="3" data-testid="moved">Moved</button>
    </div>
    <div focusgroup="grid manual" id="destination">
      <div focusgrouprow id="row"><button data-testid="first">Grid start</button></div>
    </div>`,
    );
    const result = await page.evaluate((pendingAuthorValue) => {
      const groups = globalThis.__FOCUSGROUP_POLYFILL__.m;
      const source = groups.get(document.getElementById("source"));
      const destination = groups.get(document.getElementById("destination"));
      const moved = document.querySelector('[data-testid="moved"]');
      if (pendingAuthorValue !== null) {
        moved.setAttribute("tabindex", pendingAuthorValue);
      }
      document.getElementById("row").append(moved);
      destination.update();
      source.update();
      const filtered = moved.getAttribute("tabindex");
      const marked = moved.hasAttribute("data-fg-item");
      destination.disconnect();
      return { filtered, marked, restored: moved.getAttribute("tabindex") };
    }, pendingAuthorValue);
    expect(result).toEqual({
      filtered: "-1",
      marked: true,
      restored: pendingAuthorValue ?? "3",
    });
  });
}

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

test("nested owner role survives parent reconciliation and teardown", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" id="feed">
      <div focusgroup="toolbar" tabindex="0" data-testid="toolbar"><button>A</button></div>
      <article tabindex="0">Two</article>
    </div>`,
  );
  await expect(page.getByTestId("toolbar")).toHaveRole("toolbar");
  await page.evaluate(() => {
    const owner = document.getElementById("feed");
    const feed = globalThis.__FOCUSGROUP_POLYFILL__.m.get(owner);
    feed.update();
    feed.disconnect();
  });
  await expect(page.getByTestId("toolbar")).toHaveRole("toolbar");
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
