// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

// forward-navigation/moves-to-next-item.html
test("moves to next item on ArrowDown and ArrowRight", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item2")).toBeFocused();

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// forward-navigation/moves-to-next-item-and-skips-non-focusable.html
test("moves to next item and skips non-focusable elements", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2">item2</span>
      <span data-testid="item3" tabindex="0">item3</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item3")).toBeFocused();

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item3")).toBeFocused();
});

// forward-navigation/does-not-move-when-on-focusgroup-root.html
test("does not move when focused on focusgroup root", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" tabindex="0" focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("root").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("root")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("root")).toBeFocused();
});

// forward-navigation/does-not-move-when-on-non-item.html
test("does not move when focused on focusable element that is not a focusgroup item", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<span data-testid="nonitem1" tabindex="0">nonitem1</span>
    <div tabindex="0" focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("nonitem1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("nonitem1")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("nonitem1")).toBeFocused();
});

// forward-navigation/does-not-move-when-outside-focusgroup.html
test("does not move when focused on element outside focusgroup", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<span data-testid="out" tabindex="0">out</span>
    <div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("out").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("out")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("out")).toBeFocused();
});

// forward-navigation/does-not-move-when-only-one-item.html
test("does not move when there is only one item", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// forward-navigation/does-not-move-when-only-one-item-and-wraps.html
test("does not move when there is only one item even with wrap", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// forward-navigation/does-not-wrap-when-not-supported.html
test("does not wrap when wrap is not supported", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar inline block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item2")).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// forward-navigation/wraps-successfully.html
test("wraps successfully from last item to first", async ({ page }, {
  project,
}) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar inline block wrap">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item1")).toBeFocused();

  await page.getByTestId("item2").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// forward-navigation/nested-focusgroup-is-item-of-parent.html
test.describe("nested focusgroup is item of parent focusgroup", () => {
  test("arrow right navigates TO nested focusgroup element", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<button data-testid="before" tabindex="0">before</button>
      <div data-testid="outer" focusgroup="toolbar nomemory">
        <button data-testid="btn1">btn1</button>
        <button data-testid="btn2">btn2</button>
        <button data-testid="btn3">btn3</button>
        <div data-testid="inner" focusgroup="toolbar nomemory" tabindex="0">
          <button data-testid="inner_btn1">inner btn1</button>
          <button data-testid="inner_btn2">inner btn2</button>
          <button data-testid="inner_btn3">inner btn3</button>
        </div>
        <button data-testid="btn4">btn4</button>
      </div>
      <button data-testid="after" tabindex="0">after</button>`,
    );

    await page.getByTestId("btn3").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("inner")).toBeFocused();
  });

  test("arrow left navigates TO nested focusgroup element", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="outer" focusgroup="toolbar nomemory">
        <button data-testid="btn3">btn3</button>
        <div data-testid="inner" focusgroup="toolbar nomemory" tabindex="0">
          <button data-testid="inner_btn1">inner btn1</button>
        </div>
        <button data-testid="btn4">btn4</button>
      </div>`,
    );

    await page.getByTestId("btn4").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("inner")).toBeFocused();
  });

  test("arrow right from nested focusgroup navigates to next sibling in parent", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="outer" focusgroup="toolbar nomemory">
        <button data-testid="btn3">btn3</button>
        <div data-testid="inner" focusgroup="toolbar nomemory" tabindex="0">
          <button data-testid="inner_btn1">inner btn1</button>
        </div>
        <button data-testid="btn4">btn4</button>
      </div>`,
    );

    await page.getByTestId("inner").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("btn4")).toBeFocused();
  });

  test("arrow left from nested focusgroup navigates to previous sibling in parent", async ({
    page,
  }, { project }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="outer" focusgroup="toolbar nomemory">
        <button data-testid="btn3">btn3</button>
        <div data-testid="inner" focusgroup="toolbar nomemory" tabindex="0">
          <button data-testid="inner_btn1">inner btn1</button>
        </div>
        <button data-testid="btn4">btn4</button>
      </div>`,
    );

    await page.getByTestId("inner").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("btn3")).toBeFocused();
  });

  test("inner focusgroup navigation works independently", async ({ page }, {
    project,
  }) => {
    await setupPage(
      page,
      project,
      `<div data-testid="outer" focusgroup="toolbar nomemory">
        <button data-testid="btn1">btn1</button>
        <div data-testid="inner" focusgroup="toolbar nomemory" tabindex="0">
          <button data-testid="inner_btn1">inner btn1</button>
          <button data-testid="inner_btn2">inner btn2</button>
        </div>
        <button data-testid="btn4">btn4</button>
      </div>`,
    );

    await page.getByTestId("inner_btn1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("inner_btn2")).toBeFocused();
  });
});

// forward-navigation/mixed-ltr-rtl-visual-order.html
test.describe("Arrow keys follow the focused element's writing direction", () => {
  test.describe("LTR container with RTL wrapper", () => {
    let item1;
    let item2;
    let item3;
    let item4;
    let item5;

    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="toolbar">
          <div dir="rtl">
            <span data-testid="item1" tabindex=0>One</span>
            <span data-testid="item2" tabindex=0>Two</span>
          </div>
          <span data-testid="item3" tabindex=0>Three</span>
          <span data-testid="item4" tabindex=0>Four</span>
          <span data-testid="item5" tabindex=0>Five</span>
        </div>
      `,
      );

      item1 = page.getByTestId("item1");
      item2 = page.getByTestId("item2");
      item3 = page.getByTestId("item3");
      item4 = page.getByTestId("item4");
      item5 = page.getByTestId("item5");
    });

    test("ArrowLeft (forward in RTL) from item1 moves to item2", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });

    test("ArrowLeft (forward in RTL) from item2 crosses to LTR item3", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item3).toBeFocused();
    });

    test("ArrowRight (backward in RTL) from item2 moves to item1", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });

    test("ArrowRight from LTR item3 moves to item4", async ({ page }) => {
      await item3.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item4).toBeFocused();
    });

    test("ArrowRight from LTR item4 moves to item5", async ({ page }) => {
      await item4.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item5).toBeFocused();
    });

    test("ArrowLeft from LTR item5 moves to item4", async ({ page }) => {
      await item5.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item4).toBeFocused();
    });

    test("ArrowLeft from LTR item3 crosses back to RTL item2", async ({
      page,
    }) => {
      await item3.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });
  });

  test.describe("RTL container with LTR wrapper", () => {
    let item1;
    let item2;
    let item3;

    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `
        <div focusgroup="toolbar" dir="rtl">
          <span data-testid="item1" tabindex=0>One</span>
          <div dir="ltr">
            <span data-testid="item2" tabindex=0>Two</span>
            <span data-testid="item3" tabindex=0>Three</span>
          </div>
        </div>
      `,
      );

      item1 = page.getByTestId("item1");
      item2 = page.getByTestId("item2");
      item3 = page.getByTestId("item3");
    });

    test("ArrowLeft (forward in RTL) from r1 moves to LTR r2", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });

    test("ArrowRight (forward in LTR) from r2 moves to r3", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("ArrowRight");

      await expect(item3).toBeFocused();
    });

    test("ArrowLeft (backward in LTR) from r2 moves to r1", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item1).toBeFocused();
    });

    test("ArrowLeft (backward in LTR) from r3 moves to r2", async ({
      page,
    }) => {
      await item3.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });
  });
});

// forward-navigation/rtl-direction-reverses-inline.html
test.describe("in RTL, ArrowLeft moves focus forward inline", () => {
  let item1;
  let item2;

  test.beforeEach(async ({ page }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div dir="rtl" focusgroup="toolbar">
          <span data-testid="item1" tabindex=0>item1</span>
          <span data-testid="item2" tabindex=0>item2</span>
          <span data-testid="item3" tabindex=0>item3</span>
        </div>
      `,
    );

    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test("ArrowLeft moves focus to the next item in an RTL focusgroup", async ({
    page,
  }) => {
    await item1.focus();
    await page.keyboard.press("ArrowLeft");

    await expect(item2).toBeFocused();
  });

  test("ArrowRight moves focus to the previous item in an RTL focusgroup", async ({
    page,
  }) => {
    await item2.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item1).toBeFocused();
  });

  test("ArrowDown does not move focus forward in an RTL focusgroup", async ({
    page,
  }) => {
    await item1.focus();
    await page.keyboard.press("ArrowDown");

    await expect(item1).toBeFocused();
  });

  test("ArrowUp does not move focus backward in an RTL focusgroup", async ({
    page,
  }) => {
    await item2.focus();
    await page.keyboard.press("ArrowUp");

    await expect(item2).toBeFocused();
  });
});

// forward-navigation/rtl-wraps-correctly.html
test.describe("RTL wrapping respects reversed inline direction", () => {
  let item1;
  let item3;

  test.beforeEach(async ({ page }, { project }) => {
    await setupPage(
      page,
      project,
      `
        <div dir="rtl" focusgroup="toolbar wrap">
          <span data-testid="item1" tabindex=0>One</span>
          <span data-testid="item2" tabindex=0>Two</span>
          <span data-testid="item3" tabindex=0>Three</span>
        </div>
      `,
    );

    item1 = page.getByTestId("item1");
    item3 = page.getByTestId("item3");
  });

  test("ArrowLeft at last item wraps to first item in RTL focusgroup", async ({
    page,
  }) => {
    await item3.focus();
    await page.keyboard.press("ArrowLeft");

    await expect(item1).toBeFocused();
  });

  test("ArrowRight at first item wraps to last item in RTL focusgroup", async ({
    page,
  }) => {
    await item1.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item3).toBeFocused();
  });
});

// forward-navigation/vertical-writing-mode.html
test.describe("Vertical writing-mode swaps inline and block axes", () => {
  let item1;
  let item2;

  test.beforeEach(async ({ page }) => {
    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test.describe("inline axis only", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `<div focusgroup="toolbar inline" style="writing-mode: vertical-rl;">
          <span data-testid="item1" tabindex="0">item1</span>
          <span data-testid="item2" tabindex="0">item2</span>
        </div>`,
      );
    });

    test("ArrowDown moves forward inline in vertical-rl inline-only focusgroup", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test("ArrowUp moves backward inline in vertical-rl inline-only focusgroup", async ({
      page,
    }) => {
      await item2.focus();
      await page.keyboard.press("ArrowUp");

      await expect(item1).toBeFocused();
    });

    test("ArrowLeft/ArrowRight do not move focus in vertical-rl inline-only focusgroup", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item1).toBeFocused();

      await page.keyboard.press("ArrowRight");

      await expect(item1).toBeFocused();
    });
  });

  test.describe("both axes", () => {
    test.beforeEach(async ({ page }, { project }) => {
      await setupPage(
        page,
        project,
        `<div focusgroup="toolbar inline block" style="writing-mode: vertical-rl;">
          <span data-testid="item1" tabindex="0">item1</span>
          <span data-testid="item2" tabindex="0">item2</span>
          <span data-testid="item3" tabindex="0">item3</span>
        </div>`,
      );
    });

    test("ArrowDown moves forward in both-axes vertical-rl focusgroup", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowDown");

      await expect(item2).toBeFocused();
    });

    test("ArrowLeft moves forward (block) in both-axes vertical-rl focusgroup", async ({
      page,
    }) => {
      await item1.focus();
      await page.keyboard.press("ArrowLeft");

      await expect(item2).toBeFocused();
    });
  });
});

test("skip hidden candidates", async ({ page }, { project }) => {
  await setupPage(
    page,
    project,
    `
    <div focusgroup="tablist">
      <button data-testid="item1">item1</button>
      <div hidden>
        <button>item2</button>
      </div>
      <button data-testid="item3">item3</button>
    </div>
  `,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");

  await expect(page.getByTestId("item3")).toBeFocused();
});

// forward-navigation/horizontal/does-not-move-when-axis-not-supported.html
test("horizontal: does not move when axis (ArrowRight) is not supported (block only)", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// forward-navigation/horizontal/moves-when-only-current-axis-supported.html
test("horizontal: moves when only the horizontal axis (ArrowRight) is supported (inline only)", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar inline">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("item2")).toBeFocused();
});

// forward-navigation/horizontal/rtl-inline-only.html
test.describe("horizontal: RTL with inline-only axis respects reversed arrow keys", () => {
  let item1;
  let item2;

  test.beforeEach(async ({ page }, { project }) => {
    await setupPage(
      page,
      project,
      `
      <div dir="rtl" focusgroup="toolbar inline">
        <span data-testid=item1 tabindex=0>item1</span>
        <span data-testid=item2 tabindex=0>item2</span>
      </div>
    `,
    );

    item1 = page.getByTestId("item1");
    item2 = page.getByTestId("item2");
  });

  test("ArrowLeft moves forward in RTL inline-only focusgroup", async ({
    page,
  }) => {
    await item1.focus();
    await page.keyboard.press("ArrowLeft");

    await expect(item2).toBeFocused();
  });

  test("ArrowRight moves backward in RTL inline-only focusgroup", async ({
    page,
  }) => {
    await item2.focus();
    await page.keyboard.press("ArrowRight");

    await expect(item1).toBeFocused();
  });

  test("ArrowDown and ArrowUp do not move focus in RTL inline-only focusgroup", async ({
    page,
  }) => {
    await item1.focus();
    await page.keyboard.press("ArrowDown");

    await expect(item1).toBeFocused();

    await page.keyboard.press("ArrowUp");

    await expect(item1).toBeFocused();
  });
});

// forward-navigation/vertical/does-not-move-when-axis-not-supported.html
test("vertical: does not move when axis (ArrowDown) is not supported (inline only)", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar inline">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item1")).toBeFocused();
});

// forward-navigation/vertical/moves-when-only-current-axis-supported.html
test("vertical: moves when only the vertical axis (ArrowDown) is supported (block only)", async ({
  page,
}, { project }) => {
  await setupPage(
    page,
    project,
    `<div data-testid="root" focusgroup="toolbar block">
      <span data-testid="item1" tabindex="0">item1</span>
      <span data-testid="item2" tabindex="0">item2</span>
    </div>`,
  );

  await page.getByTestId("item1").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item2")).toBeFocused();
});
