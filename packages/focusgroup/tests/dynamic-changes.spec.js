// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test.describe("`focusgroup` attribute", () => {
  let group;
  let item1;
  let item2;

  test.beforeEach(async ({ page }) => {
    group = page.getByTestId("group");
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test.describe("behavior token", () => {
    test("should change role inference", async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <span tabindex="0" data-testid="item1">item 1</span>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "tablist");
      });

      await expect(group).toHaveComputedRole("tablist");
      await expect(item1).toHaveComputedRole("tab");
      await expect(item2).toHaveComputedRole("tab");
    });

    test("should disable directional navigation if changed to `none`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "none");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test("should enable directional navigation if changed from `none`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="none" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });

    test("should disable directional navigation if changed to an invalid behavior token", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "inline listbox");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("logical axis restriction token", () => {
    test("should disable up and down arrows if `inline` is added", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox inline");
      });

      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();

      await item2.focus();
      await page.keyboard.press("ArrowUp");

      await expect(item2).toBeFocused();
    });

    test("should disable left and right arrows if `block` is added", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox block");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();

      await item2.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });

    test("should change restriction when swapped", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox inline" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox block");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();

      await item2.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("`wrap` token", () => {
    test("should enable wrap if added", async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox wrap");
      });

      await item2.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test("should disable wrap if removed", async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox wrap" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox");
      });

      await item2.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("`nomemory` token", () => {
    test("should disable memory if added", async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        <button>after</button>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox nomemory");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");

      await expect(item1).toBeFocused();
    });

    test("should enable memory if removed", async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox nomemory" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        <button>after</button>
      `,
      );

      await group.evaluate((node) => {
        node.setAttribute("focusgroup", "listbox");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");

      await expect(item2).toBeFocused();
    });
  });
});

test.describe("writing direction CSS changes", () => {
  let group;
  let item1;
  let item2;

  test.beforeEach(async ({ page }) => {
    group = page.getByTestId("group");
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test.describe("`direction`", () => {
    test("should navigate forward with ArrowLeft if changed to `rtl`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await group.evaluate((node) => {
        node.dir = "rtl";
      });

      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });

    test("should navigate backward with ArrowLeft if changed to `ltr`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group" dir="rtl">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await group.evaluate((node) => {
        node.removeAttribute("dir");
      });

      await item2.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item1).toBeFocused();
    });

    test("should navigate backward with ArrowDown if changed to `rtl` in a vertical writing mode", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group" style="writing-mode: vertical-rl;">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.dir = "rtl";
      });

      await item2.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item1).toBeFocused();
    });

    test("should navigate forward with ArrowDown if changed to `ltr` in a vertical writing mode", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group" dir="rtl" style="writing-mode: vertical-rl;">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.removeAttribute("dir");
      });

      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("writing-mode", () => {
    test("should navigate forward with ArrowLeft if changed to `vertical-rl`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox" data-testid="group" style="writing-mode: vertical-lr;">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
      );

      await group.evaluate((node) => {
        node.style.setProperty("writing-mode", "vertical-rl");
      });

      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });
  });
});

test.describe("opt-out", () => {
  let group;
  let item1;
  let item2;
  let item3;

  test.beforeEach(async ({ page }) => {
    group = page.getByTestId("group");
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    item3 = page.getByTestId("item3");
  });

  test("should remove the opt-out item from directional navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
          <button data-testid="item3">item 3</button>
        </div>
      `,
    );

    await item2.evaluate((node) => {
      node.setAttribute("focusgroup", "none");
    });

    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item3).toBeFocused();

    await page.keyboard.press("Shift+Tab");

    await expect(item2).toBeFocused();
  });

  test("should remove directional navigation from the opt-out group", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div data-testid="group" focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
    );

    await group.evaluate((node) => {
      node.setAttribute("focusgroup", "none");
    });

    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item1).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(item2).toBeFocused();
  });
});

test.describe("opt-in", () => {
  let group;
  let item1;
  let item2;

  test.beforeEach(async ({ page }) => {
    group = page.getByTestId("group");
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test("should add the opt-in item from directional navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" focusgroup="none">item 2</button>
        </div>
      `,
    );

    await item2.evaluate((node) => {
      node.removeAttribute("focusgroup");
    });

    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item2).toBeFocused();
  });

  test("should add directional navigation to the opt-in group", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div data-testid="group" focusgroup="none">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
      `,
    );

    await group.evaluate((node) => {
      node.setAttribute("focusgroup", "listbox");
    });

    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item2).toBeFocused();
  });
});

test.describe("`focusgroupstart` item", () => {
  let item1;
  let item2;
  let item3;
  let before;
  let after;

  test.beforeEach(async ({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    item3 = page.getByTestId("item3");
    before = page.getByTestId("before");
    after = page.getByTestId("after");
  });

  test.describe("added", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        <button data-testid="after">after</button>
        `,
      );
    });

    test("should not affect navigation if the group already has memorized tab stop", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("Tab");

      await item1.evaluate((node) => {
        node.toggleAttribute("focusgroupstart", true);
      });

      await page.keyboard.press("Shift+Tab");

      await expect(item2).toBeFocused();
    });

    test("should move the tab stop to the element", async ({ page }) => {
      await item2.evaluate((node) => {
        node.toggleAttribute("focusgroupstart", true);
      });

      await after.focus();
      await page.keyboard.press("Shift+Tab");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("removed", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" focusgroupstart>item 2</button>
        </div>
        `,
      );
    });

    test("should not affect navigation if the group already has memorized tab stop", async ({
      page,
    }) => {
      await before.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");

      await item2.evaluate((node) => {
        node.removeAttribute("focusgroupstart");
      });

      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();
    });

    test("should move the tab stop to the first element", async ({ page }) => {
      await item2.evaluate((node) => {
        node.removeAttribute("focusgroupstart");
      });

      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("added with an existing `focusgroupstart` element", () => {
    test("should move the tab stop to the element if added before the existing one", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" focusgroupstart>item 2</button>
        </div>
        `,
      );

      await item1.evaluate((node) => {
        node.toggleAttribute("focusgroupstart", true);
      });

      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item1).toBeFocused();
    });

    test("should keep the tab stop unchanged if added after the existing one", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" focusgroupstart>item 2</button>
          <button data-testid="item3">item 3</button>
        </div>
        `,
      );

      await item3.evaluate((node) => {
        node.toggleAttribute("focusgroupstart", true);
      });

      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("removed with anothor focusgroupstart element", () => {
    test("should move the tab stop to the other one if removed before it", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" focusgroupstart>item 2</button>
          <button data-testid="item3" focusgroupstart>item 3</button>
        </div>
        `,
      );

      await item2.evaluate((node) => {
        node.removeAttribute("focusgroupstart");
      });

      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item3).toBeFocused();
    });
  });

  test("should keep `focusgroupstart` position after moving when no memory", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <button data-testid="before">before</button>
      <div focusgroup="tablist nomemory" data-testid="tablist">
        <button data-testid="item1">tab 1</button>
        <button data-testid="item2" focusgroupstart>tab 2</button>
        <button data-testid="item3">tab 3</button>
      </div>
      `,
    );

    const tablist = page.getByTestId("tablist");

    await tablist.evaluate((node) => {
      const tabs = node.querySelectorAll("button");
      node.addEventListener("focusin", (evt) => {
        tabs.forEach((tab) => {
          tab.toggleAttribute("focusgroupstart", tab === evt.target);
        });
      });
    });

    await before.focus();
    await page.keyboard.press("Tab"); // on item2
    await page.keyboard.press("ArrowRight"); // on item3
    await before.focus(); // on before
    await page.keyboard.press("Tab"); // on item3

    await expect(item3).toBeFocused();
  });
});

test.describe("item keyboard focusability", () => {
  let item1;
  let item2;
  let item3;

  test.beforeEach(async ({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    item3 = page.getByTestId("item3");
  });

  test.describe("`tabindex`", () => {
    test("should remove an item from directional navigation if changed to `-1`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
          <button data-testid="item3">item 3</button>
        </div>
        `,
      );

      await item2.evaluate((node) => {
        node.tabIndex = -1;
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });

    test("should add an item to directional navigation if changed to `0`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" tabindex="-1">item 2</button>
        </div>
        `,
      );

      await item2.evaluate((node) => {
        node.removeAttribute("tabindex");
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("`disabled`", () => {
    test("should remove an item from directional navigation if changed to `true`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
          <button data-testid="item3">item 3</button>
        </div>
        `,
      );

      await item2.evaluate((node) => {
        node.disabled = true;
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });

    test("should add an item to directional navigation if changed to `false`", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2" disabled>item 2</button>
        </div>
        `,
      );

      await item2.evaluate((node) => {
        node.disabled = false;
      });

      await item1.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item2).toBeFocused();
    });
  });
});

test.describe("current tab stop element", () => {
  let item1;
  let item2;
  let before;

  test.beforeEach(async ({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    before = page.getByTestId("before");
  });

  test.describe("added", () => {
    test("should move tab stop to the first item", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
        </div>
        `,
      );

      await before.focus();
      await item1.evaluate((node) => {
        const button = document.createElement("button");
        button.dataset.testid = "item2";
        node.before(button);
      });
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("removed", () => {
    test("should move tab stop to the first item", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await before.focus();
      await item1.evaluate((node) => {
        node.remove();
      });
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();
    });

    test("should move memorized tab stop to the first item", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await item1.focus();
      await item1.evaluate((node) => {
        node.remove();
      });
      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();
    });

    test("should move memorized tab stop to the first item if parent removed", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <span data-testid="item2-parent">
            <button data-testid="item2">item 2</button>
          </span>
        </div>
        `,
      );

      await item2.focus();
      await page.getByTestId("item2-parent").evaluate((node) => {
        node.remove();
      });
      await before.focus();
      await page.keyboard.press("Tab");

      await expect(item1).toBeFocused();
    });

    test("should keep the active focus when no menory", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="toolbar nomemory">
          <span tabindex="0" data-testid="item1">item1</span>
          <span tabindex="0" data-testid="item2">
            item2
            <span tabindex="0" data-testid="item2-1" focusgroupstart>item2.1</span>
          </span>
          <span tabindex="0" data-testid="item3">item3</span>
        </div>
      `,
      );

      const item2 = page.getByTestId("item2");
      const item21 = page.getByTestId("item2-1");

      await item2.focus();
      await item21.evaluate((node) => {
        node.setAttribute("focusgroup", "none");
      });

      await expect(item2).toBeFocused();

      await page.keyboard.press("ArrowRight");

      await expect(page.getByTestId("item3")).toBeFocused();
    });
  });

  test.describe("hidden", () => {
    test("should move tab stop to the nearest item", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="toolbar">
          <button data-testid="item1">item1</button>
          <div data-testid="target">
            <button data-testid="item2">item2</button>
          </div>
          <button data-testid="item3">item3</button>
        </div>
      `,
      );

      await page.getByTestId("item2").focus();
      await page.getByTestId("target").evaluate((node) => {
        node.hidden = true;
      });

      await page.getByTestId("before").focus();
      await page.keyboard.press("Tab");

      await expect(page.getByTestId("item1")).toBeFocused();
    });
  });

  test.describe("opt-out", () => {
    test("should move tab stop to the nearest item", async ({ page }, {
      project,
    }) => {
      await setupPage(
        page,
        project,
        `
        <button data-testid="before">before</button>
        <div focusgroup="toolbar">
          <button data-testid="item1">item1</button>
          <button data-testid="item2">item2</button>
        </div>
      `,
      );

      const item1 = page.getByTestId("item1");
      const item2 = page.getByTestId("item2");
      await item1.focus();
      await page.keyboard.press("ArrowRight");
      await item2.evaluate((node) => {
        node.setAttribute("focusgroup", "none");
      });

      await page.getByTestId("before").focus();
      await page.keyboard.press("Tab");

      await expect(item1).toBeFocused();
    });
  });
});

test.describe("segmentor", () => {
  let item1;
  let item2;
  let segmentor;
  let after;

  test.beforeEach(async ({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
    segmentor = page.getByTestId("segmentor");
    after = page.getByTestId("after");
  });

  test.describe("added", () => {
    test("should add tab stop to all segments if added an opt-out element", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await item1.evaluate((node) => {
        const segmentor = document.createElement("button");
        segmentor.setAttribute("focusgroup", "none");
        segmentor.dataset.testid = "segmentor";

        node.after(segmentor);
      });

      await segmentor.focus();
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Shift+Tab");

      await expect(item1).toBeFocused();
    });

    test("should add tab stop to all segments if added a nested group", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await item1.evaluate((node) => {
        const nested = document.createElement("span");
        nested.setAttribute("focusgroup", "listbox");
        const item = document.createElement("button");
        item.dataset.testid = "segmentor";
        nested.append(item);

        node.after(nested);
      });

      await segmentor.focus();
      await page.keyboard.press("Tab");

      await expect(item2).toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Shift+Tab");

      await expect(item1).toBeFocused();
    });

    test("should not add tab stop if added a nest group with no focusable items", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="item2">item 2</button>
        </div>
        <button data-testid="after">after</button>
        `,
      );

      await item1.evaluate((node) => {
        const nested = document.createElement("span");
        nested.setAttribute("focusgroup", "listbox");
        nested.dataset.testid = "segmentor";

        node.after(nested);
      });

      await item1.focus();
      await page.keyboard.press("Tab");

      await expect(after).toBeFocused();
    });
  });

  test.describe("removed", () => {
    test("should keep one tab stop element within the merged segments", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="segmentor" focusgroup="none">opt out</button>
          <button data-testid="item2">item 2</button>
        </div>
        <button data-testid="after">after</button>
        `,
      );

      await segmentor.evaluate((node) => {
        node.remove();
      });

      await item1.focus();
      await page.keyboard.press("Tab");

      await expect(after).toBeFocused();
    });

    test("should keep the current memorized element as tab stop", async ({
      page,
    }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="listbox">
          <button data-testid="item1">item 1</button>
          <button data-testid="segmentor" focusgroup="none">opt out</button>
          <button data-testid="item2">item 2</button>
        </div>
        `,
      );

      await item1.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      await segmentor.evaluate((node) => {
        node.remove();
      });

      await page.keyboard.press("ArrowLeft");

      await expect(item1).toBeFocused();
    });
  });
});

test.describe("visibility", () => {
  test("hiding an item removes it from directional navigation", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="tablist">
        <button data-testid="item1">item1</button>
        <div data-testid="target">
          <button data-testid="item2">item2</button>
        </div>
        <button data-testid="item3">item3</button>
      </div>
    `,
    );

    await page.getByTestId("target").evaluate((node) => {
      node.hidden = true;
    });

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item3")).toBeFocused();
  });

  test("showing an item adds it to directional navigation", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `
      <div focusgroup="tablist">
        <button data-testid="item1">item1</button>
        <div data-testid="target" hidden>
          <button data-testid="item2">item2</button>
        </div>
        <button data-testid="item3">item3</button>
      </div>
    `,
    );

    await page.getByTestId("target").evaluate((node) => {
      node.hidden = false;
    });

    await page.getByTestId("item1").focus();
    await page.keyboard.press("ArrowRight");

    await expect(page.getByTestId("item2")).toBeFocused();
  });
});
