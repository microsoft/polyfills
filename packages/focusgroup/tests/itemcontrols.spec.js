// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, pressTab, setupPage } from "./utils.js";

test("feed navigation, roles, entry, and activity follow nested controls", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <button data-testid="before">Before</button>
      <div focusgroup="feed" data-testid="feed">
        <div tabindex="0" data-testid="first">
          First <button focusgroup="none" data-testid="like">Like</button>
          <button focusgroup="none" tabindex="-1" data-testid="more">More</button>
        </div>
        <div tabindex="0" data-testid="second">
          Second <button focusgroup="none" data-testid="reply">Reply</button>
        </div>
      </div>
      <button data-testid="after">After</button>
    `,
  );

  await expect(page.getByTestId("feed")).toHaveComputedRole("feed");
  await expect(page.getByTestId("first")).toHaveComputedRole("article");
  await expect(page.getByTestId("second")).toHaveComputedRole("article");
  await page.getByTestId("before").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("first")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("like")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await pressTab(page, project, true);
  await expect(page.getByTestId("first")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("second")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("first")).toBeFocused();
  await page.getByTestId("more").focus();
  await expect(page.getByTestId("reply")).toHaveAttribute("tabindex", "-1");
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await pressTab(page, project, true);
  await expect(page.getByTestId("first")).toBeFocused();
});

for (const nestedBehavior of ["none", "toolbar"]) {
  test(`Shift+Tab redirects a remaining ${nestedBehavior} control stop to the remembered feed item`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div focusgroup="feed">
          <div tabindex="0" data-testid="first">First item</div>
          <div tabindex="0" data-testid="second">Second item
            <div focusgroup="${nestedBehavior}">
              <button data-testid="action">Nested action</button>
            </div>
          </div>
        </div>
        <button data-testid="after">After</button>
      `,
    );
    await page.getByTestId("first").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("second")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("action")).toBeFocused();

    // Author event isolation can prevent the outer owner from seeing focusout,
    // leaving the remembered item's controls as reverse-entry candidates.
    await page.getByTestId("action").evaluate((element) => {
      element.addEventListener("focusout", (event) => event.stopPropagation(), {
        once: true,
      });
    });
    await page.getByTestId("after").focus();
    await expect(page.getByTestId("action")).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.evaluate(() => {
      document.body.dataset.focusTrace = "";
      document.addEventListener(
        "focusin",
        (event) => {
          document.body.dataset.focusTrace += `${event.target.dataset.testid},`;
        },
        { capture: true },
      );
    });

    await pressTab(page, project, true);
    await expect(page.getByTestId("second")).toBeFocused();
    await expect(page.getByTestId("action")).not.toBeFocused();
    await expect(page.locator("body")).toHaveAttribute(
      "data-focus-trace",
      "action,second,",
    );
  });
}

test("noitemcontrols overrides feed default and explicit modifier", async ({
  page,
}, { project }) => {
  for (const tokens of [
    "feed noitemcontrols",
    "feed itemcontrols noitemcontrols",
  ]) {
    await setupPage(
      page,
      project,
      `
        <div focusgroup="${tokens}">
          <div tabindex="0" data-testid="one">One
            <button focusgroup="none" data-testid="one-action">Action</button>
          </div>
          <div tabindex="0" data-testid="two">Two
            <button focusgroup="none" data-testid="two-action">Action</button>
          </div>
        </div>
        <button data-testid="after">After</button>
      `,
    );
    await page.getByTestId("one").focus();
    await expect(page.getByTestId("two-action")).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("two-action")).toBeFocused();
  }
});

test("unassociated opt-outs stay sequential and nearest ownership stops at a nested owner", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="feed" data-testid="outer">
        <button focusgroup="none" data-testid="standalone">Standalone</button>
        <div tabindex="0" data-testid="outer-item">Outer
          <div focusgroup="menu noitemcontrols" data-testid="inner">
            <button data-testid="inner-item">Inner item</button>
            <button focusgroup="none" data-testid="inner-action">Inner action</button>
          </div>
        </div>
        <div tabindex="0" data-testid="other">Other
          <button focusgroup="none" data-testid="other-action">Other action</button>
        </div>
      </div>
    `,
  );
  await page.getByTestId("other").focus();
  await expect(page.getByTestId("standalone")).not.toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.getByTestId("inner-item")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.getByTestId("inner-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await page.getByTestId("inner-action").focus();
  await expect(page.getByTestId("inner-action")).not.toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.getByTestId("other-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
});

test("independent nested focusgroups retain their navigation and require every enclosing item to be active", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="feed">
        <div tabindex="0" data-testid="outer-one">Outer one
          <div focusgroup="feed">
            <div tabindex="0" data-testid="middle-one">Middle one
              <div focusgroup="toolbar" data-testid="inner">
                <button data-testid="inner-one">One</button>
                <button data-testid="inner-two">Two</button>
              </div>
            </div>
            <div tabindex="0" data-testid="middle-two">Middle two</div>
          </div>
        </div>
        <div tabindex="0" data-testid="outer-two">Outer two</div>
      </div>
      <button data-testid="after">After</button>
    `,
  );
  await page.getByTestId("outer-two").focus();
  await expect(page.getByTestId("inner-one")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("middle-two").focus();
  await expect(page.getByTestId("inner-one")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("middle-one").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("inner-one")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("inner-two")).toBeFocused();
  await page.getByTestId("outer-two").focus();
  await expect(page.getByTestId("inner-two")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("middle-one").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("inner-two")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await pressTab(page, project, true);
  await expect(page.getByTestId("outer-one")).toBeFocused();
});

test("grid itemcontrols filters opted-out and nested controls by cell without changing coordinates", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <table focusgroup="grid">
        <tr>
          <td tabindex="0" data-testid="a">A
            <button focusgroup="none" data-testid="a-action">A action</button>
          </td>
          <td tabindex="0" data-testid="b">B
            <div focusgroup="toolbar">
              <button data-testid="b-action">B action</button>
            </div>
          </td>
        </tr>
      </table>
      <button data-testid="after">After</button>
    `,
  );
  await page.getByTestId("a").focus();
  await expect(page.getByTestId("b-action")).toHaveAttribute("tabindex", "-1");
  await pressTab(page, project);
  await expect(page.getByTestId("a-action")).toBeFocused();
  await page.getByTestId("a").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("b")).toBeFocused();
  await expect(page.getByTestId("a-action")).toHaveAttribute("tabindex", "-1");
  await pressTab(page, project);
  await expect(page.getByTestId("b-action")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
});

test("mutations update eligible controls without stealing focus", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
      <div focusgroup="feed">
        <div tabindex="0" data-testid="one">One
          <button focusgroup="none" data-testid="old">Old</button>
        </div>
        <div tabindex="0" data-testid="two">Two
          <button focusgroup="none" data-testid="other">Other</button>
        </div>
      </div>
    `,
  );
  await page.getByTestId("two").focus();
  await page.evaluate(() => {
    document.querySelector('[data-testid="old"]').remove();
    document
      .querySelector('[data-testid="one"]')
      .insertAdjacentHTML(
        "beforeend",
        '<button focusgroup="none" data-testid="new">New</button>',
      );
  });
  await expect(page.getByTestId("new")).toHaveAttribute("tabindex", "-1");
  await expect(page.getByTestId("two")).toBeFocused();
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("new")).not.toHaveAttribute("tabindex", "-1");
  await page.getByTestId("new").focus();
  await page.getByTestId("new").evaluate((element) => {
    element.disabled = true;
  });
  await expect(page.getByTestId("new")).toBeDisabled();
  await page.getByTestId("two").focus();
  await expect(page.getByTestId("other")).not.toHaveAttribute("tabindex", "-1");
});

test("feed is polyfilled despite native support unless native V2 is allowed", async ({
  page,
}, { project }) => {
  for (const allowNative of [false, true]) {
    await page.goto("about:blank");
    await page.goto("/test.html");
    await page.setContent(
      `<div focusgroup="feed"><div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="action">Action</button></div>
        <div tabindex="0" data-testid="two">Two</div></div>`,
    );
    await page.evaluate(
      async ({ allowNative, specifier }) => {
        globalThis.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__ = allowNative;
        document.body.focusGroup = {
          supports: (token) => ["feed", "itemcontrols"].includes(token),
        };
        const { polyfill } = await import(specifier);
        polyfill();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      },
      {
        allowNative,
        specifier: project.name.endsWith("Shadowless")
          ? "/build/index-shadowless.mjs"
          : "/build/index.mjs",
      },
    );
    if (allowNative) {
      await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "0");
    } else {
      await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
    }
  }
});

for (const behavior of [
  "feed",
  "toolbar block itemcontrols",
  "feed nomemory",
]) {
  test(`${behavior}: negative-tabindex control focus updates owner-relative memory`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <button data-testid="before">Before</button>
      <div focusgroup="${behavior}">
        <div tabindex="0" data-testid="one">One
          <button focusgroup="none" data-testid="one-action">Action</button>
        </div>
        <div tabindex="0" data-testid="two">Two
          <button focusgroup="none" tabindex="-1" data-testid="negative">Negative</button>
          <button focusgroup="none" data-testid="two-action">Action</button>
        </div>
      </div>
      <button data-testid="after">After</button>
    `,
    );
    await page.getByTestId("one").focus();
    await page.getByTestId("negative").focus();
    await expect(page.getByTestId("negative")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await expect(page.getByTestId("one-action")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await pressTab(page, project);
    await expect(page.getByTestId("two-action")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("after")).toBeFocused();
    await pressTab(page, project, true);
    await expect(
      page.getByTestId(behavior.includes("nomemory") ? "one" : "two"),
    ).toBeFocused();
  });
}

for (const modifier of ["", " noitemcontrols"]) {
  test(`grid sibling targets${modifier}: cell association preserves arrow navigation`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <table focusgroup="grid${modifier}">
        <tr>
          <td><button data-testid="one">One</button>
            <button focusgroup="none" data-testid="one-action">Action</button></td>
          <td><button data-testid="two">Two</button>
            <button focusgroup="none" data-testid="two-action">Action</button></td>
        </tr>
      </table>
      <button data-testid="after">After</button>
    `,
    );
    await page.getByTestId("one").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("two")).toBeFocused();
    await pressTab(page, project);
    await expect(page.getByTestId("two-action")).toBeFocused();
    if (!modifier) {
      await page.getByTestId("one-action").focus();
      await expect(page.getByTestId("two-action")).toHaveAttribute(
        "tabindex",
        "-1",
      );
      await pressTab(page, project);
      await expect(page.getByTestId("after")).toBeFocused();
      await pressTab(page, project, true);
      await expect(page.getByTestId("one")).toBeFocused();
    }
  });
}

test("changing ownership updates activity and memory without moving focus", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <div data-testid="new-item">
          <button focusgroup="none" data-testid="action">Action</button>
        </div>
      </div>
      <div tabindex="0" data-testid="two">Two
        <button focusgroup="none" data-testid="two-action">Action</button>
      </div>
    </div>
    <button data-testid="after">After</button>
  `,
  );
  await page.getByTestId("action").focus();
  await page.getByTestId("new-item").evaluate((el) => (el.tabIndex = 0));
  await expect(page.getByTestId("action")).toBeFocused();
  await expect(page.getByTestId("new-item")).toHaveAttribute("data-fg-item");
  await expect(page.getByTestId("two-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await page.getByTestId("after").focus();
  await pressTab(page, project, true);
  await expect(page.getByTestId("new-item")).toBeFocused();
});

test("author tabindex changes and removing itemcontrols restore authored eligibility", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed" data-testid="owner">
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>
    <button data-testid="after">After</button>
  `,
  );
  await page.getByTestId("two").focus();
  await page
    .getByTestId("action")
    .evaluate((el) => el.setAttribute("tabindex", "0"));
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "0");
  await pressTab(page, project);
  await expect(page.getByTestId("action")).toBeFocused();
  await page
    .getByTestId("owner")
    .evaluate((el) => el.setAttribute("focusgroup", "feed noitemcontrols"));
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "0");
  await expect(page.getByTestId("action")).toBeFocused();
});

test("an authored tabindex=-1 on an inactive item's control survives activation", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>
    <button data-testid="after">After</button>
  `,
  );
  await page.getByTestId("two").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
  // Same value the filter already wrote, so only oldValue tells them apart.
  await page
    .getByTestId("action")
    .evaluate((el) => el.setAttribute("tabindex", "-1"));
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
});

test("nested none wrappers are transparent to opt-out association", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <div focusgroup="none"><div focusgroup="none">
          <button data-testid="action">Action</button>
        </div></div>
      </div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>
    <button data-testid="after">After</button>
  `,
  );
  await page.getByTestId("two").focus();
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("action").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await pressTab(page, project, true);
  await expect(page.getByTestId("one")).toBeFocused();
});

for (const behavior of ["feed", "grid manual"]) {
  test(`${behavior}: rendering and inertness mutations invalidate remembered items`, async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="${behavior}">
        <div focusgrouprow>
          <div tabindex="0" data-testid="one">One
            <button focusgroup="none" data-testid="one-action">Action</button>
          </div>
          <div tabindex="0" data-testid="two">Two
            <div focusgroup="none" data-testid="controls">
              <button data-testid="two-action">Action</button>
            </div>
          </div>
        </div>
      </div>
      <button data-testid="after">After</button>
    `,
    );
    await page.getByTestId("two-action").focus();
    await page.getByTestId("controls").evaluate((el) => (el.inert = true));
    await page.getByTestId("one").focus();
    await page.getByTestId("controls").evaluate((el) => (el.inert = false));
    await expect(page.getByTestId("two-action")).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await page.getByTestId("two").focus();
    await pressTab(page, project);
    await expect(page.getByTestId("two-action")).toBeFocused();
    await page.getByTestId("after").focus();
    await page.getByTestId("two").evaluate((el) => (el.style.display = "none"));
    await expect(page.getByTestId("one")).toHaveAttribute("tabindex", "0");
    await page.getByTestId("two").evaluate((el) => (el.style.display = ""));
    await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
    await pressTab(page, project, true);
    await expect(page.getByTestId("one")).toBeFocused();
  });
}

test("feed controls inside shadow items track arrow navigation @shadow", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="feed"><div data-testid="host"></div></div>
    <button data-testid="after">After</button>
  `,
  );
  await page.getByTestId("host").evaluate((host) => {
    host.attachShadow({ mode: "open" }).innerHTML = `
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="one-action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two
        <button focusgroup="none" data-testid="two-action">Action</button>
      </div>`;
  });
  await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("one").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await expect(page.getByTestId("one-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await pressTab(page, project);
  await expect(page.getByTestId("two-action")).toBeFocused();
  await pressTab(page, project);
  await expect(page.getByTestId("after")).toBeFocused();
  await pressTab(page, project, true);
  await expect(page.getByTestId("two")).toBeFocused();
});

test("V1 native behavior without native itemcontrols still installs the filter", async ({
  page,
}, { project }) => {
  await page.goto("/test.html");
  await page.setContent(`
    <div focusgroup="toolbar itemcontrols">
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two</div>
    </div>`);
  await page.evaluate(
    async (specifier) => {
      document.body.focusGroup = { supports: (token) => token === "toolbar" };
      const { polyfill } = await import(specifier);
      polyfill();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  await expect(page.getByTestId("two")).toHaveAttribute("tabindex", "-1");
  await page.getByTestId("one").focus();
  await pressTab(page, project);
  await expect(page.getByTestId("action")).toBeFocused();
});

test("removing an owner subtree releases controls with their original tabindex", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `
    <section data-testid="wrapper"><div focusgroup="feed">
      <div tabindex="0">One
        <button focusgroup="none" data-testid="action">Action</button>
      </div>
    </div></section>`,
  );
  await expect(page.getByTestId("action")).toHaveAttribute("tabindex", "-1");
  const action = await page.getByTestId("action").elementHandle();
  await page.getByTestId("wrapper").evaluate((el) => el.remove());
  await expect.poll(() => action.getAttribute("tabindex")).toBeNull();
});

test("noitemcontrols is polyfilled when native itemcontrols cannot be disabled", async ({
  page,
}, { project }) => {
  const specifier = project.name.endsWith("Shadowless")
    ? "/build/index-shadowless.mjs"
    : "/build/index.mjs";
  for (const { attr, supported, polyfilled } of [
    {
      attr: "feed noitemcontrols",
      supported: ["feed", "itemcontrols"],
      polyfilled: true,
    },
    {
      attr: "feed noitemcontrols",
      supported: ["feed", "itemcontrols", "noitemcontrols"],
      polyfilled: false,
    },
    // Without native itemcontrols there is nothing for noitemcontrols to undo.
    {
      attr: "toolbar noitemcontrols",
      supported: ["toolbar"],
      polyfilled: false,
    },
  ]) {
    await page.goto("about:blank");
    await page.goto("/test.html");
    await page.setContent(
      `<div focusgroup="${attr}"><div tabindex="0">One</div>
        <div tabindex="0" data-testid="two">Two</div></div>`,
    );
    await page.evaluate(
      async ({ supported, specifier }) => {
        globalThis.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__ = true;
        document.body.focusGroup = {
          supports: (token) => supported.includes(token),
        };
        const { polyfill } = await import(specifier);
        polyfill();
        await new Promise((resolve) => requestAnimationFrame(resolve));
      },
      { supported, specifier },
    );
    await expect(page.getByTestId("two")).toHaveAttribute(
      "tabindex",
      polyfilled ? "-1" : "0",
    );
  }
});

test("item controls work when the engine lacks :popover-open", async ({
  page,
}, { project }) => {
  await page.goto("/test.html");
  await page.setContent(`
    <div focusgroup="feed">
      <div tabindex="0" data-testid="one">One
        <button focusgroup="none" data-testid="one-action">Action</button>
      </div>
      <div tabindex="0" data-testid="two">Two
        <button focusgroup="none" data-testid="two-action">Action</button>
      </div>
    </div>`);
  await page.evaluate(
    async (specifier) => {
      const matches = Element.prototype.matches;
      Element.prototype.matches = function (selector) {
        if (selector.includes(":popover-open")) {
          throw new DOMException("Unsupported selector", "SyntaxError");
        }
        return matches.call(this, selector);
      };
      const { polyfill } = await import(specifier);
      polyfill();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    project.name.endsWith("Shadowless")
      ? "/build/index-shadowless.mjs"
      : "/build/index.mjs",
  );
  await page.getByTestId("one").focus();
  await expect(page.getByTestId("two-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("two")).toBeFocused();
  await expect(page.getByTestId("one-action")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await pressTab(page, project);
  await expect(page.getByTestId("two-action")).toBeFocused();
});
