import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// sequential-navigation/basic-tab-behavior.html
test.describe("basic tab behavior", () => {
  test("Tab enters focusgroup at first item in tree order and exits normally", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before" tabindex="0">Before focusgroup</div>
        <div data-testid="focusgroup1" focusgroup="toolbar nomemory">
          <span data-testid="item1" tabindex="0">Item 1</span>
          <span data-testid="item2" tabindex="0">Item 2</span>
          <span data-testid="item3" tabindex="0">Item 3</span>
        </div>
        <div data-testid="after" tabindex="0">After focusgroup</div>`,
    );

    await page.getByTestId("before").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("after")).toBeFocused();
  });

  test("Shift+Tab enters focusgroup at first item in tree order and exits normally", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before" tabindex="0">Before focusgroup</div>
        <div data-testid="focusgroup1" focusgroup="toolbar nomemory">
          <span data-testid="item1" tabindex="0">Item 1</span>
          <span data-testid="item2" tabindex="0">Item 2</span>
          <span data-testid="item3" tabindex="0">Item 3</span>
        </div>
        <div data-testid="after" tabindex="0">After focusgroup</div>`,
    );

    await page.getByTestId("after").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("item1")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("before")).toBeFocused();
  });

  test("arrow key navigation continues to work normally within focusgroup", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="focusgroup1" focusgroup="toolbar nomemory">
        <span data-testid="item1" tabindex="0">Item 1</span>
        <span data-testid="item2" tabindex="0">Item 2</span>
        <span data-testid="item3" tabindex="0">Item 3</span>
      </div>`,
    );

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("item3")).toBeFocused();
  });
});

// sequential-navigation/nested-focusgroups.html
test.describe("nested focusgroups sequential navigation", () => {
  test("forward Tab navigation through nested focusgroups", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before1" tabindex="0">Before outer</div>
      <div data-testid="outer" focusgroup="toolbar">
        <span data-testid="outer1" tabindex="0" focusgroupstart>Outer 1 (priority)</span>
        <div data-testid="inner" focusgroup="toolbar nomemory">
          <span data-testid="inner1" tabindex="0" focusgroupstart>Inner 1 (priority)</span>
          <span data-testid="inner2" tabindex="0">Inner 2</span>
        </div>
        <span data-testid="outer2" tabindex="0">Outer 2</span>
      </div>
      <div data-testid="after1" tabindex="0">After outer</div>`,
    );

    await page.getByTestId("before1").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("outer1")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("inner1")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("outer2")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("after1")).toBeFocused();
  });

  test("reverse Shift+Tab navigation through nested focusgroups", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before1" tabindex="0">Before outer</div>
      <div data-testid="outer" focusgroup="toolbar">
        <span data-testid="outer1" tabindex="0" focusgroupstart>Outer 1 (priority)</span>
        <div data-testid="inner" focusgroup="toolbar nomemory">
          <span data-testid="inner1" tabindex="0" focusgroupstart>Inner 1 (priority)</span>
          <span data-testid="inner2" tabindex="0">Inner 2</span>
        </div>
        <span data-testid="outer2" tabindex="0">Outer 2</span>
      </div>
      <div data-testid="after1" tabindex="0">After outer</div>`,
    );

    await page.getByTestId("after1").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("outer2")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("inner1")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("outer1")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("before1")).toBeFocused();
  });
});

// sequential-navigation/arrow-key-handler-all-types.html
test.describe("native arrow key handler elements block arrow exit", () => {
  test("arrow navigation TO text input works", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-text" focusgroup="toolbar">
        <button data-testid="btn-text-before">Before</button>
        <input data-testid="text-input" type="text" value="test" />
        <button data-testid="btn-text-after">After</button>
      </div>`,
    );

    await page.getByTestId("btn-text-before").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("text-input")).toBeFocused();
  });

  test("arrow navigation FROM text input is blocked", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-text" focusgroup="toolbar">
        <button data-testid="btn-text-before">Before</button>
        <input data-testid="text-input" type="text" value="test" />
        <button data-testid="btn-text-after">After</button>
      </div>`,
    );

    await page.getByTestId("text-input").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("text-input")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("text-input")).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("text-input")).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("text-input")).toBeFocused();
  });

  test("arrow navigation TO textarea works", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-textarea" focusgroup="toolbar">
        <button data-testid="btn-textarea-before">Before</button>
        <textarea data-testid="textarea">Content</textarea>
        <button data-testid="btn-textarea-after">After</button>
      </div>`,
    );

    await page.getByTestId("btn-textarea-before").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("textarea")).toBeFocused();
  });

  test("arrow navigation FROM textarea is blocked", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-textarea" focusgroup="toolbar">
        <button data-testid="btn-textarea-before">Before</button>
        <textarea data-testid="textarea">Content</textarea>
        <button data-testid="btn-textarea-after">After</button>
      </div>`,
    );

    await page.getByTestId("textarea").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("textarea")).toBeFocused();
  });

  test("arrow navigation TO select works", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-select" focusgroup="toolbar">
        <button data-testid="btn-select-before">Before</button>
        <select data-testid="select-input">
          <option>A</option>
          <option>B</option>
        </select>
        <button data-testid="btn-select-after">After</button>
      </div>`,
    );

    await page.getByTestId("btn-select-before").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("select-input")).toBeFocused();
  });

  test("arrow navigation TO contenteditable works", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-editable" focusgroup="toolbar">
        <button data-testid="btn-editable-before">Before</button>
        <div data-testid="editable" contenteditable="true" tabindex="0">Editable</div>
        <button data-testid="btn-editable-after">After</button>
      </div>`,
    );

    await page.getByTestId("btn-editable-before").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("editable")).toBeFocused();
  });

  test("arrow navigation FROM contenteditable is blocked", async ({ page }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar-editable" focusgroup="toolbar">
        <button data-testid="btn-editable-before">Before</button>
        <div data-testid="editable" contenteditable="true" tabindex="0">Editable</div>
        <button data-testid="btn-editable-after">After</button>
      </div>`,
    );

    await page.getByTestId("editable").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("editable")).toBeFocused();
  });
});

// sequential-navigation/arrow-key-handler-only-item.html
test("arrow key from only item in focusgroup does not navigate", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="toolbar" focusgroup="toolbar">
      <button data-testid="only-item">Only Item</button>
    </div>`,
  );

  await page.getByTestId("only-item").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("only-item")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("only-item")).toBeFocused();
});

// sequential-navigation/arrow-key-handler-with-explicit-optout.html
test("arrow keys do not work within explicitly opted-out sections", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="toolbar" focusgroup="toolbar">
      <button data-testid="item1">Item 1</button>
      <div data-testid="optout" focusgroup="none">
        <button data-testid="optout-item">Opted out item</button>
      </div>
      <button data-testid="item2">Item 2</button>
    </div>`,
  );

  await page.getByTestId("optout-item").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("optout-item")).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("optout-item")).toBeFocused();
});

// sequential-navigation/focusgroup-segments.html
test.describe("focusgroup segments", () => {
  test("arrow key navigation treats opted-out elements as if they don't exist", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar" focusgroup="toolbar wrap" aria-label="Text formatting">
        <button data-testid="bold" type="button">Bold</button>
        <button data-testid="italic" type="button">Italic</button>
        <span data-testid="help-group" focusgroup="none" aria-label="Help group">
          <button data-testid="help" type="button">Help</button>
          <button data-testid="shortcuts" type="button">Shortcuts</button>
        </span>
        <button data-testid="underline" type="button">Underline</button>
      </div>`,
    );

    await page.getByTestId("bold").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("italic")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("underline")).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("italic")).toBeFocused();
  });

  test("Tab navigation through focusgroup segments - forward direction", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before" tabindex="0">Before toolbar</div>
        <div data-testid="toolbar" focusgroup="toolbar wrap" aria-label="Text formatting">
          <button data-testid="bold" type="button" focusgroupstart>Bold (priority)</button>
          <button data-testid="italic" type="button">Italic</button>
          <span data-testid="help-group" focusgroup="none" aria-label="Help group">
            <button data-testid="help" type="button">Help</button>
            <button data-testid="shortcuts" type="button">Shortcuts</button>
          </span>
          <button data-testid="underline" type="button" focusgroupstart>Underline (priority)</button>
        </div>
        <div data-testid="after" tabindex="0">After toolbar</div>`,
    );

    await page.getByTestId("before").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("bold")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("help")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("shortcuts")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("underline")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("after")).toBeFocused();
  });

  test("arrow keys do not work within opted-out focusgroup sections", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="toolbar" focusgroup="toolbar wrap" aria-label="Text formatting">
        <button data-testid="bold">Bold</button>
        <span data-testid="help-group" focusgroup="none">
          <button data-testid="help">Help</button>
          <button data-testid="shortcuts">Shortcuts</button>
        </span>
        <button data-testid="underline">Underline</button>
      </div>`,
    );

    await page.getByTestId("help").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("help")).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("help")).toBeFocused();
  });
});

// sequential-navigation/memory-behavior.html
test.describe("memory behavior", () => {
  test("focusgroup with memory remembers last focused item on re-entry", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before-memory" tabindex="0">Before memory focusgroup</div>
        <div data-testid="memory-focusgroup" focusgroup="toolbar">
          <button data-testid="memory-item1">Item 1</button>
          <button data-testid="memory-item2" focusgroupstart>Item 2 (priority)</button>
          <button data-testid="memory-item3">Item 3</button>
        </div>
        <div data-testid="between" tabindex="0">Between focusgroups</div>`,
    );

    await page.getByTestId("before-memory").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("memory-item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("memory-item3")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("between")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("memory-item3")).toBeFocused();
  });

  test("focusgroup with nomemory does not remember last focused item", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="between" tabindex="0">Between focusgroups</div>
        <div data-testid="no-memory-focusgroup" focusgroup="toolbar nomemory">
          <button data-testid="no-memory-item1">Item 1</button>
          <button data-testid="no-memory-item2" focusgroupstart>Item 2 (priority)</button>
          <button data-testid="no-memory-item3">Item 3</button>
        </div>
        <div data-testid="after-no-memory" tabindex="0">After nomemory focusgroup</div>`,
    );

    await page.getByTestId("between").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("no-memory-item2")).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("no-memory-item3")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("after-no-memory")).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("no-memory-item2")).toBeFocused();
  });

  test("arrow key navigation updates the current focused item", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="memory-focusgroup" focusgroup="toolbar">
        <button data-testid="memory-item1">Item 1</button>
        <button data-testid="memory-item2" focusgroupstart>Item 2 (priority)</button>
        <button data-testid="memory-item3">Item 3</button>
      </div>`,
    );

    await page.getByTestId("memory-item2").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("memory-item1")).toBeFocused();
  });
});

// sequential-navigation/guaranteed-tab-stop-priority.html
test.describe("guaranteed tab stop priority", () => {
  test("focusgroupstart element is the guaranteed tab stop entry point", async ({
    page,
  }) => {
    await setupPage(
      page,
      `<div data-testid="before" tabindex="0">Before</div>
        <div data-testid="focusgroup" focusgroup="toolbar nomemory">
          <button data-testid="item1">Item 1</button>
          <button data-testid="item2" focusgroupstart>Item 2 (priority)</button>
          <button data-testid="item3">Item 3</button>
        </div>
        <div data-testid="after" tabindex="0">After</div>`,
    );

    await page.getByTestId("before").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("item2")).toBeFocused();
  });

  test("a single item in a group should not lose focusability", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
      <button data-testid="before">before</button>
      <div focusgroup="tablist">
        <button data-testid="item">Item</button>
      </div>
      <button data-testid="after">after</button>
    `,
    );

    const before = page.getByTestId("before");
    const after = page.getByTestId("after");
    const item = page.getByTestId("item");

    await before.focus();
    await page.keyboard.press("Tab");

    await expect(item).toBeFocused();

    await page.keyboard.press("ArrowRight");

    await expect(item).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(after).toBeFocused();

    await page.keyboard.press("Shift+Tab");

    await expect(item).toBeFocused();
  });

  test("an item nested in another item’s shadow root can be a tab stop", async ({
    page,
    channel,
  }) => {
    if (channel === "chrome-canary") {
      test.skip("chromium implementation has a bug");
    } else {
      test.fixme();
    }

    await setupPage(
      page,
      `
      <div focusgroup="tablist">
        <div tabindex="0">
          <template shadowrootmode="open">
            <div tabindex="0" data-testid="item">item</div>
          </template>
        </div>
      </div>
      <button>after</button>
    `,
    );

    const item = page.getByTestId("item");
    await item.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect(item).toBeFocused();
  });

  test("an item deeper nested in another item’s shadow root can be a tab stop", async ({
    page,
    channel,
  }) => {
    if (channel === "chrome-canary") {
      test.skip("chromium implementation has a bug");
    } else {
      test.fixme();
    }

    await setupPage(
      page,
      `
      <div focusgroup="tablist">
        <div tabindex="0">
          <template shadowrootmode="open">
            <div tabindex="0">
              <template shadowrootmode="open">
                <div tabindex="0" data-testid="item">item</div>
              </template>
            </div>
          </template>
        </div>
      </div>
      <button>after</button>
    `,
    );

    const item = page.getByTestId("item");
    await item.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect(item).toBeFocused();
  });

  test("an item slotted in another item’s shadow root can be a tab stop", async ({
    page,
    channel,
  }) => {
    if (channel === "chrome-canary") {
      test.skip("chromium implementation has a bug");
    } else {
      test.fixme();
    }

    await setupPage(
      page,
      `
      <div focusgroup="tablist">
        <div tabindex="0">
          <template shadowrootmode="open">
            <slot></slot>
          </template>
          <div tabindex="0" data-testid="item">item</div>
        </div>
      </div>
      <button>after</button>
    `,
    );

    const item = page.getByTestId("item");
    await item.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect(item).toBeFocused();
  });

  test("an item deeper slotted in another item’s shadow root can be a tab stop", async ({
    page,
    channel,
  }) => {
    if (channel === "chrome-canary") {
      test.skip("chromium implementation has a bug");
    } else {
      test.fixme();
    }

    await setupPage(
      page,
      `
      <div focusgroup="tablist">
        <div tabindex="0">
          <template shadowrootmode="open">
            <div tabindex="0">
              <slot></slot>
            </div>
          </template>
          <div tabindex="0" data-testid="item">item</div>
        </div>
      </div>
      <button>after</button>
    `,
    );

    const item = page.getByTestId("item");
    await item.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect(item).toBeFocused();
  });
});

// sequential-navigation/empty-and-non-focusable.html
test("empty focusgroup - navigation stays put if no focusable items nearby", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="toolbar-with-items" focusgroup="toolbar">
      <button data-testid="item1">Item 1</button>
      <button data-testid="item2">Item 2</button>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// sequential-navigation/dynamic-changes.html
test("dynamic focusgroupstart changes affect entry element selection", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <div data-testid="before" tabindex="0">Before</div>

    <div focusgroup="toolbar nomemory">
      <span data-testid="item1" tabindex="0">Item 1</span>
      <span data-testid="item2" tabindex="0">Item 2</span>
    </div>

    <div data-testid="after" tabindex="0">After</div>
  `,
  );

  const before = page.getByTestId("before");
  await before.focus();
  await page.keyboard.press("Tab");

  await expect(page.getByTestId("item1")).toBeFocused();

  const item2 = page.getByTestId("item2");
  await item2.evaluate((node) => {
    node.setAttribute("focusgroupstart", "");
  });

  await before.focus();
  await page.keyboard.press("Tab");

  await expect(item2).toBeFocused();
});

test("enabling disabled elements makes them available for tab stop", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <div data-testid="before" tabindex="0">Before</div>

    <div focusgroup="toolbar nomemory">
      <button data-testid="btn1" disabled>Button 1</button>
      <button data-testid="btn2">Button 2</button>
    </div>

    <div data-testid="after" tabindex="0">After</div>
  `,
  );

  const before = page.getByTestId("before");
  const btn1 = page.getByTestId("btn1");
  const btn2 = page.getByTestId("btn2");

  await before.focus();
  await page.keyboard.press("Tab");

  await expect(btn2).toBeFocused();

  await btn1.evaluate((node) => {
    node.removeAttribute("disabled");
  });

  await before.focus();
  await page.keyboard.press("Tab");

  await expect(btn1).toBeFocused();
});

// sequential-navigation/arrow-key-handler-tab-escape.html
test("Tab from a native arrow key handler moves focus to the next segment with the same focusgroup, if any", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="before" tabindex="0">Before</div>
      <div data-testid="toolbar" focusgroup="toolbar">
        <button data-testid="btn-before">Before input</button>
        <input data-testid="text-input" type="text" value="test">
        <button data-testid="btn-after">After input</button>
      </div>
      <div data-testid="after" tabindex="0">After</div>`,
  );

  await page.getByTestId("text-input").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("btn-after")).toBeFocused();
});

// sequential-navigation/arrow-key-handler-multiple-in-segment.html
test("multiple arrow key handler elements can exist in a segment", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="toolbar" focusgroup="toolbar">
      <button data-testid="item1">Item 1</button>
      <input data-testid="input1" type="text" value="a" />
      <input data-testid="input2" type="text" value="b" />
      <button data-testid="item2">Item 2</button>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("input1")).toBeFocused();

  // Arrow navigation from input is blocked
  await page.getByTestId("input1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("input1")).toBeFocused();
});

// sequential-navigation/arrow-key-handler-nested-focusgroup.html
test("arrow key handler in nested focusgroup blocks its own navigation", async ({
  page,
}) => {
  await setupPage(
    page,
    `<div data-testid="outer" focusgroup="toolbar">
      <button data-testid="outer-item1">Outer 1</button>
      <div data-testid="inner" focusgroup="toolbar">
        <button data-testid="inner-item1">Inner 1</button>
        <input data-testid="inner-input" type="text" value="test" />
        <button data-testid="inner-item2">Inner 2</button>
      </div>
      <button data-testid="outer-item2">Outer 2</button>
    </div>`,
  );

  await page.getByTestId("inner-item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("inner-input")).toBeFocused();
});

// sequential-navigation/arrow-key-handler-scrollable-container.html
test("navigation works correctly in scrollable container", async ({ page }) => {
  await setupPage(
    page,
    `<div data-testid="toolbar" focusgroup="toolbar" style="overflow: scroll; height: 100px;">
      <button data-testid="item1">Item 1</button>
      <button data-testid="item2">Item 2</button>
      <button data-testid="item3">Item 3</button>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();
});

test("respects preventDefault()", async ({ page }) => {
  await setupPage(
    page,
    `
    <div focusgroup="toolbar">
      <button data-testid="item1">item 1</button>
      <input data-testid="item2">
      <button data-testid="item3">item 3</button>
    </div>
  `,
  );

  const item1 = page.getByTestId("item1");
  const input = page.getByTestId("item2");

  await item1.focus();
  await page.keyboard.press("ArrowRight");

  await expect(input).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(page.getByTestId("item3")).toBeFocused();

  await input.evaluate((node) => {
    node.addEventListener("keydown", (evt) => {
      evt.preventDefault();
    });
  });

  await item1.focus();
  await page.keyboard.press("ArrowRight");

  await expect(input).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(input).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  await expect(input).toBeFocused();
});

test("clicking on an item makes the item the tab stop for the group", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <button data-testid="before">before</button>
    <div focusgroup="toolbar">
      <div tabindex="0">item 1</div>
      <div tabindex="0" data-testid="item2">item 2</div>
    </div>
    `,
  );

  const item2 = page.getByTestId("item2");
  await item2.click();
  await page.keyboard.press("Shift+Tab");

  await expect(page.getByTestId("before")).toBeFocused();
});

test("programmatically focusing on an item makes the item the tab stop for the group", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <button data-testid="before">before</button>
    <div focusgroup="toolbar">
      <div tabindex="0">item 1</div>
      <div tabindex="0" data-testid="item2">item 2</div>
    </div>
    `,
  );

  const item2 = page.getByTestId("item2");
  await item2.evaluate((node) => {
    node.focus();
  });
  await page.keyboard.press("Shift+Tab");

  await expect(page.getByTestId("before")).toBeFocused();
});
