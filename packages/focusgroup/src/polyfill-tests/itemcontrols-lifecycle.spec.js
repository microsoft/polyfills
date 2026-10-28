// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

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

test("the polyfill root is not an owner without a focusgroup attribute", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar"><button>One</button></div>`,
  );
  expect(
    await page.evaluate(() =>
      [...globalThis.__FOCUSGROUP_POLYFILL__.m.keys()].map(
        (el) => el.localName,
      ),
    ),
  ).toEqual(["div"]);
});

test("empty authored tabindex is restored after item teardown", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed" data-testid="owner"><button tabindex="" data-testid="one">One</button><button tabindex="">Two</button></div>`,
  );
  await page
    .getByTestId("owner")
    .evaluate((el) => el.setAttribute("focusgroup", "none"));
  await expect(page.getByTestId("one")).toHaveAttribute("tabindex", "");
  await page.getByTestId("one").focus();
  await pressTab(page, project);
  await expect(
    page.getByRole("button", { name: "Two", exact: true }),
  ).toBeFocused();
});

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

test("an invalidated grid clears its lookup indexes", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<table id="grid"><tbody><tr><td><button id="first">A</button></td><td><button>B</button></td></tr></tbody></table>`,
  );
  const result = await page.evaluate(async () => {
    const { GridItemCollection } = await import("/src/grid-item-collection.js");
    const owner = document.getElementById("grid");
    const collection = new GridItemCollection(owner, false);
    const first = document.getElementById("first");
    const initiallyValid = collection.valid;
    owner.tBodies[0].insertAdjacentHTML(
      "beforeend",
      "<tr><td><button>C</button></td></tr>",
    );
    collection.decorate();
    return {
      initiallyValid,
      validAfterInvalidation: collection.valid,
      isItem: collection.isItem(first),
      contains: collection.contains(first),
      itemForNode: collection.itemForNode(first),
    };
  });
  expect(result).toEqual({
    initiallyValid: true,
    validAfterInvalidation: false,
    isItem: false,
    contains: false,
    itemForNode: null,
  });
});

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
}

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

for (const movedNode of ["target", "cell"]) {
  test(`destination-first grid transfer restores source ${movedNode} structure`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div focusgroup="grid manual" id="source">
        <div focusgrouprow id="row"><div id="cell"><button data-testid="moved">Moved</button></div></div>
      </div>
      <div focusgroup="grid manual" id="destination">
        <div focusgrouprow><div id="destination-cell"></div></div>
      </div>`,
    );
    const result = await page.evaluate((movedNode) => {
      const source = globalThis.__FOCUSGROUP_POLYFILL__.m.get(
        document.getElementById("source"),
      );
      const destination = globalThis.__FOCUSGROUP_POLYFILL__.m.get(
        document.getElementById("destination"),
      );
      const moved =
        movedNode === "target"
          ? document.querySelector('[data-testid="moved"]')
          : document.getElementById("cell");
      document.getElementById("destination-cell").append(moved);
      destination.update();
      source.update();
      return {
        rowRole: document.getElementById("row").getAttribute("role"),
        cellRole: document.getElementById("cell").getAttribute("role"),
        item: document
          .querySelector('[data-testid="moved"]')
          .getAttribute("data-fg-item"),
      };
    }, movedNode);
    expect(result.rowRole).toBeNull();
    expect(result.cellRole).toBeNull();
    expect(result.item).not.toBeNull();
  });
}

test("grid reconciliation preserves inferred roles on nested owners and children", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="grid manual" id="grid">
      <div focusgrouprow><div focusgroup="tablist" tabindex="0" data-testid="nested">
        <button data-testid="nested-item">Item</button>
      </div></div>
    </div>`,
  );
  const result = await page.evaluate(() => {
    const grid = globalThis.__FOCUSGROUP_POLYFILL__.m.get(
      document.getElementById("grid"),
    );
    const nested = document.querySelector('[data-testid="nested"]');
    const item = document.querySelector('[data-testid="nested-item"]');
    grid.update();
    const afterUpdate = [
      nested.getAttribute("role"),
      item.getAttribute("role"),
    ];
    grid.disconnect();
    return {
      afterUpdate,
      afterDisconnect: [nested.getAttribute("role"), item.getAttribute("role")],
    };
  });
  expect(result).toEqual({
    afterUpdate: ["tablist", "tab"],
    afterDisconnect: ["tablist", "tab"],
  });
});

test("fullscreen changes reconcile inactive feed controls without DOM mutations", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="feed">
      <article tabindex="0" data-testid="active">
        Active <button type="button" data-testid="enter">Enter fullscreen</button>
      </article>
      <article tabindex="0" data-testid="fullscreen">
        Inactive <button focusgroup="none" data-testid="control">Control</button>
      </article>
    </div>`,
  );
  await page.getByTestId("active").focus();
  const control = page.getByTestId("control");
  await expect(control).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("enter").evaluate((button) => {
    const article = document.querySelector('[data-testid="fullscreen"]');
    button.addEventListener("click", () => article.requestFullscreen(), {
      once: true,
    });
  });
  await page.getByTestId("enter").click();
  await page.waitForFunction(() => document.fullscreenElement);
  await expect(control).not.toHaveAttribute("tabindex", "-1");
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForFunction(() => !document.fullscreenElement);
  await expect(control).toHaveAttribute("tabindex", "-1");
});
