import { expect, test } from "@playwright/test";

test.describe("isKeyboardFocusable()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("returns true if element has contenteditable=true", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const div = Object.assign(document.createElement("div"), {
          contentEditable: "true",
        });
        // `Element.isContentEditable` is always `false` unless the element is
        // connected.
        document.body.append(div);

        return isKeyboardFocusable(div);
      }),
    ).toBe(true);
  });

  test("returns true if element has contenteditable=plaintext-only", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const div = Object.assign(document.createElement("div"), {
          contentEditable: "plaintext-only",
        });
        // `Element.isContentEditable` is always `false` unless the element is
        // connected.
        document.body.append(div);

        return isKeyboardFocusable(div);
      }),
    ).toBe(true);
  });

  test("returns false if element has contenteditable=false", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        return isKeyboardFocusable(
          Object.assign(document.createElement("div"), {
            contentEditable: "false",
          }),
        );
      }),
    ).toBe(false);
  });

  test("returns true if element has contenteditable=false and tabindex=0", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        return isKeyboardFocusable(
          Object.assign(document.createElement("div"), {
            contentEditable: "false",
            tabIndex: 0,
          }),
        );
      }),
    ).toBe(true);
  });

  test("returns true for natively focusable elements (button)", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        return isKeyboardFocusable(document.createElement("button"));
      }),
    ).toBe(true);
  });

  test("returns true for element with tabindex=0", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        return isKeyboardFocusable(
          Object.assign(document.createElement("div"), { tabIndex: 0 }),
        );
      }),
    ).toBe(true);
  });

  test("returns false for element with tabindex=-1", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        return isKeyboardFocusable(
          Object.assign(document.createElement("div"), { tabIndex: -1 }),
        );
      }),
    ).toBe(false);
  });

  test("returns false if element is disabled", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("button");
        el.disabled = true;
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns false if element has disabled attribute", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.tabIndex = 0;
        el.setAttribute("disabled", "");
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns false for anchor without href", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("a");
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);

    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("a");
        el.tabIndex = 0;
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns true for anchor with href", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("a");
        el.href = "#";
        return isKeyboardFocusable(el);
      }),
    ).toBe(true);
  });

  test("returns false if element is inert", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("button");
        el.inert = true;
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns false if element is hidden", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("button");
        el.hidden = true;
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns false for input type=hidden", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("input");
        el.type = "hidden";
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns false for audio without controls", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("audio");
        el.tabIndex = 0;
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });

  test("returns true for audio with controls", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("audio");
        el.controls = true;
        return isKeyboardFocusable(el);
      }),
    ).toBe(true);
  });

  test("returns false if element has AUTHOR_TABINDEX attribute", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { DatasetName } = await import("/src/constants.js");
        const { isKeyboardFocusable } = await import("/src/utils.js");
        const el = document.createElement("button");
        el.setAttribute(DatasetName.AUTHOR_TABINDEX, "0");
        return isKeyboardFocusable(el);
      }),
    ).toBe(false);
  });
});

test.describe("isSegmentor()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("returns true for a focusable element with focusgroup='none'", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.tabIndex = 0;
        el.setAttribute("focusgroup", "none");
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(true);
  });

  test("returns false for a focusable element with focusgroup (no 'none')", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.tabIndex = 0;
        el.setAttribute("focusgroup", "");
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(false);
  });

  test("returns true for a non-focusable element whose subtree contains focusable children", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.setAttribute("focusgroup", "");
        const child = document.createElement("button");
        el.append(child);
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(true);
  });

  test("returns false for a non-focusable element with no focusable children", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.setAttribute("focusgroup", "");
        const child = document.createElement("span");
        el.append(child);
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(false);
  });

  test("returns false for a non-focusable element with an empty subtree", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.setAttribute("focusgroup", "");
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(false);
  });

  test("returns true for a focusable element with focusgroup containing 'none' among other tokens", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.tabIndex = 0;
        el.setAttribute("focusgroup", "inline none");
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(true);
  });

  test("returns true for a non-focusable element with deeply nested focusable descendants", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { isSegmentor } = await import("/src/utils.js");
        const el = document.createElement("div");
        el.setAttribute("focusgroup", "");
        const wrapper = document.createElement("div");
        const button = document.createElement("button");
        wrapper.append(button);
        el.append(wrapper);
        document.body.append(el);
        return isSegmentor(el);
      }),
    ).toBe(true);
  });
});

test.describe("inferRole()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setContent("");
  });

  test("sets owner role for behavior with mapped owner role", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("div");
      inferRole(el, "tablist", "owner");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBe("tablist");
    expect(result.hasMarker).toBe(true);
  });

  test("sets child role for behavior with mapped child role", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("span");
      inferRole(el, "tablist", "child");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBe("tab");
    expect(result.hasMarker).toBe(true);
  });

  test("does not overwrite author-defined role", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("div");
      el.setAttribute("role", "navigation");
      inferRole(el, "tablist", "owner");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBe("navigation");
    expect(result.hasMarker).toBe(false);
  });

  test("overwrites previously inferred role", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("div");
      inferRole(el, "tablist", "owner");
      inferRole(el, "menu", "owner");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBe("menu");
    expect(result.hasMarker).toBe(true);
  });

  test("clears inferred role when behavior has no mapped role", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("div");
      inferRole(el, "tablist", "owner");
      inferRole(el, "none", "owner");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBeNull();
    expect(result.hasMarker).toBe(false);
  });

  test("no-op when no mapped role and no inferred role", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("div");
      inferRole(el, "none", "owner");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBeNull();
    expect(result.hasMarker).toBe(false);
  });

  test("no-op when no mapped child role and no inferred role", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("span");
      inferRole(el, "toolbar", "child");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBeNull();
    expect(result.hasMarker).toBe(false);
  });

  test("clears inferred child role when switching to behavior with null child", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { inferRole } = await import("/src/utils.js");
      const el = document.createElement("span");
      inferRole(el, "tablist", "child");
      inferRole(el, "toolbar", "child");
      return {
        role: el.getAttribute("role"),
        hasMarker: el.hasAttribute("data-fg-ir"),
      };
    });
    expect(result.role).toBeNull();
    expect(result.hasMarker).toBe(false);
  });
});

test.describe("getNavigationDirection()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const arrowkeyTestCases = [
    // key, writing-mode, direction, axis, expect

    // horizontal-tb + ltr (default)
    ["ArrowUp", "horizontal-tb", "ltr", undefined, "backward"],
    ["ArrowDown", "horizontal-tb", "ltr", undefined, "forward"],
    ["ArrowLeft", "horizontal-tb", "ltr", undefined, "backward"],
    ["ArrowRight", "horizontal-tb", "ltr", undefined, "forward"],
    ["ArrowUp", "horizontal-tb", "ltr", "inline", null],
    ["ArrowDown", "horizontal-tb", "ltr", "inline", null],
    ["ArrowLeft", "horizontal-tb", "ltr", "inline", "backward"],
    ["ArrowRight", "horizontal-tb", "ltr", "inline", "forward"],
    ["ArrowUp", "horizontal-tb", "ltr", "block", "backward"],
    ["ArrowDown", "horizontal-tb", "ltr", "block", "forward"],
    ["ArrowLeft", "horizontal-tb", "ltr", "block", null],
    ["ArrowRight", "horizontal-tb", "ltr", "block", null],
    // horizontal-tb + rtl
    ["ArrowUp", "horizontal-tb", "rtl", undefined, "backward"],
    ["ArrowDown", "horizontal-tb", "rtl", undefined, "forward"],
    ["ArrowLeft", "horizontal-tb", "rtl", undefined, "forward"],
    ["ArrowRight", "horizontal-tb", "rtl", undefined, "backward"],
    ["ArrowUp", "horizontal-tb", "rtl", "inline", null],
    ["ArrowDown", "horizontal-tb", "rtl", "inline", null],
    ["ArrowLeft", "horizontal-tb", "rtl", "inline", "forward"],
    ["ArrowRight", "horizontal-tb", "rtl", "inline", "backward"],
    ["ArrowUp", "horizontal-tb", "rtl", "block", "backward"],
    ["ArrowDown", "horizontal-tb", "rtl", "block", "forward"],
    ["ArrowLeft", "horizontal-tb", "rtl", "block", null],
    ["ArrowRight", "horizontal-tb", "rtl", "block", null],
    // vertical-lr / sideways-lr + ltr
    ["ArrowUp", "vertical-lr", "ltr", undefined, "backward"],
    ["ArrowDown", "vertical-lr", "ltr", undefined, "forward"],
    ["ArrowLeft", "vertical-lr", "ltr", undefined, "backward"],
    ["ArrowRight", "vertical-lr", "ltr", undefined, "forward"],
    ["ArrowUp", "vertical-lr", "ltr", "inline", "backward"],
    ["ArrowDown", "vertical-lr", "ltr", "inline", "forward"],
    ["ArrowLeft", "vertical-lr", "ltr", "inline", null],
    ["ArrowRight", "vertical-lr", "ltr", "inline", null],
    ["ArrowUp", "vertical-lr", "ltr", "block", null],
    ["ArrowDown", "vertical-lr", "ltr", "block", null],
    ["ArrowLeft", "vertical-lr", "ltr", "block", "backward"],
    ["ArrowRight", "vertical-lr", "ltr", "block", "forward"],
    // vertical-lr / sideways-lr + rtl
    ["ArrowUp", "vertical-lr", "rtl", undefined, "forward"],
    ["ArrowDown", "vertical-lr", "rtl", undefined, "backward"],
    ["ArrowLeft", "vertical-lr", "rtl", undefined, "forward"],
    ["ArrowRight", "vertical-lr", "rtl", undefined, "backward"],
    ["ArrowUp", "vertical-lr", "rtl", "inline", "forward"],
    ["ArrowDown", "vertical-lr", "rtl", "inline", "backward"],
    ["ArrowLeft", "vertical-lr", "rtl", "inline", null],
    ["ArrowRight", "vertical-lr", "rtl", "inline", null],
    ["ArrowUp", "vertical-lr", "rtl", "block", null],
    ["ArrowDown", "vertical-lr", "rtl", "block", null],
    ["ArrowLeft", "vertical-lr", "rtl", "block", "forward"],
    ["ArrowRight", "vertical-lr", "rtl", "block", "backward"],
    // vertical-rl / sideways-rl + ltr
    ["ArrowUp", "vertical-rl", "ltr", undefined, "backward"],
    ["ArrowDown", "vertical-rl", "ltr", undefined, "forward"],
    ["ArrowLeft", "vertical-rl", "ltr", undefined, "forward"],
    ["ArrowRight", "vertical-rl", "ltr", undefined, "backward"],
    ["ArrowUp", "vertical-rl", "ltr", "inline", "backward"],
    ["ArrowDown", "vertical-rl", "ltr", "inline", "forward"],
    ["ArrowLeft", "vertical-rl", "ltr", "inline", null],
    ["ArrowRight", "vertical-rl", "ltr", "inline", null],
    ["ArrowUp", "vertical-rl", "ltr", "block", null],
    ["ArrowDown", "vertical-rl", "ltr", "block", null],
    ["ArrowLeft", "vertical-rl", "ltr", "block", "forward"],
    ["ArrowRight", "vertical-rl", "ltr", "block", "backward"],
    // vertical-rl / sideways-rl + rtl
    ["ArrowUp", "vertical-rl", "rtl", undefined, "forward"],
    ["ArrowDown", "vertical-rl", "rtl", undefined, "backward"],
    ["ArrowLeft", "vertical-rl", "rtl", undefined, "backward"],
    ["ArrowRight", "vertical-rl", "rtl", undefined, "forward"],
    ["ArrowUp", "vertical-rl", "rtl", "inline", "forward"],
    ["ArrowDown", "vertical-rl", "rtl", "inline", "backward"],
    ["ArrowLeft", "vertical-rl", "rtl", "inline", null],
    ["ArrowRight", "vertical-rl", "rtl", "inline", null],
    ["ArrowUp", "vertical-rl", "rtl", "block", null],
    ["ArrowDown", "vertical-rl", "rtl", "block", null],
    ["ArrowLeft", "vertical-rl", "rtl", "block", "backward"],
    ["ArrowRight", "vertical-rl", "rtl", "block", "forward"],
  ];

  // Arrow keys
  function testArrowKey({ key, writingMode, direction, axis, expected }) {
    const testName = [
      `should return ${expected} when ${key} is pressed in `,
      `${writingMode} ${direction}`,
      axis ? ` with "${axis}" axis` : undefined,
    ]
      .filter(Boolean)
      .join("");

    test(testName, async ({ page }) => {
      expect(
        await evaluate(page, {
          eventInit: {
            key,
          },
          ownerStyle: {
            writingMode,
            direction,
          },
          axis,
        }),
      ).toBe(expected);
    });
  }
  for (const testCase of arrowkeyTestCases) {
    const [key, writingMode, direction, axis, expected] = testCase;

    testArrowKey({ key, writingMode, direction, axis, expected });

    if (writingMode.startsWith("vertical")) {
      testArrowKey({
        key,
        writingMode: writingMode.replace("vertical", "sideways"),
        direction,
        axis,
        expected,
      });
    }
  }

  function evaluate(page, { eventInit, ownerStyle, axis }) {
    return page.evaluate(
      async ({ eventInit, ownerStyle, axis }) => {
        const { getNavigationDirection } = await import("/src/utils.js");
        const owner = document.createElement("div");

        document.body.appendChild(owner);

        if (ownerStyle) {
          Object.assign(owner.style, ownerStyle);
        }

        const event = new KeyboardEvent("keydown", eventInit);
        const result = getNavigationDirection(event, owner, axis);

        owner.remove();

        return result;
      },
      { eventInit, ownerStyle, axis },
    );
  }

  // Modifier keys should suppress navigation

  test("should return null when shiftKey is pressed", async ({ page }) => {
    expect(
      await evaluate(page, { eventInit: { key: "ArrowDown", shiftKey: true } }),
    ).toBeNull();
  });

  test("should return null when ctrlKey is pressed", async ({ page }) => {
    expect(
      await evaluate(page, { eventInit: { key: "ArrowDown", ctrlKey: true } }),
    ).toBeNull();
  });

  test("should return null when metaKey is pressed", async ({ page }) => {
    expect(
      await evaluate(page, { eventInit: { key: "ArrowDown", metaKey: true } }),
    ).toBeNull();
  });

  // Unrecognised keys

  test("should return null when a non-arrow/Home/End key is pressed", async ({
    page,
  }) => {
    expect(await evaluate(page, { eventInit: { key: "Tab" } })).toBeNull();
  });

  // Home / End

  test("should return start when Home is pressed", async ({ page }) => {
    expect(await evaluate(page, { eventInit: { key: "Home" } })).toBe("start");
  });

  test("should return end when End is pressed", async ({ page }) => {
    expect(await evaluate(page, { eventInit: { key: "End" } })).toBe("end");
  });

  test("should return start when Home is pressed with an inline axis limit", async ({
    page,
  }) => {
    expect(
      await evaluate(page, { eventInit: { key: "Home" }, axis: "inline" }),
    ).toBe("start");
  });

  test("should return end when End is pressed with a block axis limit", async ({
    page,
  }) => {
    expect(
      await evaluate(page, { eventInit: { key: "End" }, axis: "block" }),
    ).toBe("end");
  });
});
