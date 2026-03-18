import { expect, test } from "@playwright/test";

test.describe("shadowClosest()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setContent(`
      <div class="a" data-testid="light-container">
        <div class="b-l" data-testid="light-unique-container">
          <div class="c" data-testid="light-child"></div>
          <div class="d" data-testid="light-host">
            <template shadowrootmode="open">
              <div class="a" data-testid="shadow1-container">
                <div class="b-s1" data-testid="shadow1-unique-container">
                  <div class="c" data-testid="shadow1-child"></div>
                  <div class="d" data-testid="shadow1-host">
                    <template shadowrootmode="open">
                      <div class="a" data-testid="shadow2-container">
                        <div class="c" data-testid="shadow2-child"></div>
                      </div>
                    </template>
                  </div>
                </div>
                <slot></slot>
              </div>
            </template>
            <div data-testid="slotted-child"></div>
          </div>
        </div>
      </div>
    `);
  });

  test("should behave like Element.closest() if element exists in the same DOM", async ({
    page,
  }) => {
    const el = page.getByTestId("light-child");

    expect(
      await el.evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".c") === el;
      }),
    ).toBe(true);

    expect(
      await el.evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".a")?.dataset.testid;
      }),
    ).toBe("light-container");

    expect(
      await page.getByTestId("shadow1-child").evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".a")?.dataset.testid;
      }),
    ).toBe("shadow1-container");

    expect(
      await page.getByTestId("shadow2-child").evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".a")?.dataset.testid;
      }),
    ).toBe("shadow2-container");

    expect(
      await el.evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".none");
      }),
    ).toBeNull();
  });

  test("should be able to find its own host element", async ({ page }) => {
    expect(
      await page.getByTestId("shadow1-child").evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".d")?.dataset.testid;
      }),
    ).toBe("light-host");

    expect(
      await page.getByTestId("shadow2-child").evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".d")?.dataset.testid;
      }),
    ).toBe("shadow1-host");
  });

  test("should find an ancestor across shadow boundaries", async ({ page }) => {
    const el = page.getByTestId("shadow2-child");

    expect(
      await el.evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".b-s1")?.dataset.testid;
      }),
    ).toBe("shadow1-unique-container");

    expect(
      await el.evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".b-l")?.dataset.testid;
      }),
    ).toBe("light-unique-container");
  });

  test("should find a slotted element’s slot container in shadow DOM", async ({
    page,
  }) => {
    expect(
      await page.getByTestId("slotted-child").evaluate(async (el) => {
        const { shadowClosest } = await import("/src/shadow-utils/dom.js");
        return shadowClosest(el, ".a")?.dataset.testid;
      }),
    ).toBe("shadow1-container");
  });
});

test.describe("nodeContains()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setContent(`
      <div id="parent">
        <div id="child">
          <template shadowrootmode="open">
            <div id="shadow-container">
              <div id="shadow-child"></div>
              <slot></slot>
            </div>
          </template>
          <div id="slotted-child"></div>
        </div>
      </div>
    `);
  });

  test("should return true when otherNode is inside the node in light DOM", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const parent = document.getElementById("parent");
        const child = document.getElementById("child");
        return nodeContains(parent, child);
      }),
    ).toBe(true);
  });

  test("should return true when otherNode is inside a shadow root of node", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const child = document.getElementById("child");
        const shadowChild = child.shadowRoot.getElementById("shadow-child");
        return nodeContains(child, shadowChild);
      }),
    ).toBe(true);
  });

  test("should return true when node is an ancestor of the shadow host", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const parent = document.getElementById("parent");
        const shadowChild = document
          .getElementById("child")
          .shadowRoot.getElementById("shadow-child");
        return nodeContains(parent, shadowChild);
      }),
    ).toBe(true);
  });

  test("should return true for a slotted child relative to the slot container in shadow DOM", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const shadowContainer = document
          .getElementById("child")
          .shadowRoot.getElementById("shadow-container");
        const slottedChild = document.getElementById("slotted-child");
        return nodeContains(shadowContainer, slottedChild);
      }),
    ).toBe(true);
  });

  test("should return true for a slotted child relative to the shadow host", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const child = document.getElementById("child");
        const slottedChild = document.getElementById("slotted-child");
        return nodeContains(child, slottedChild);
      }),
    ).toBe(true);
  });

  test("should return true for a slotted child relative to an ancestor of the shadow host", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const parent = document.getElementById("parent");
        const slottedChild = document.getElementById("slotted-child");
        return nodeContains(parent, slottedChild);
      }),
    ).toBe(true);
  });

  test("should return false when either argument is null", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        return nodeContains(null, document.body);
      }),
    ).toBe(false);

    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        return nodeContains(document.body, null);
      }),
    ).toBe(false);
  });

  test("should return false when otherNode is not contained", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { nodeContains } = await import("/src/shadow-utils/dom.js");
        const parent = document.getElementById("parent");
        const shadowChild = document
          .getElementById("child")
          .shadowRoot.getElementById("shadow-child");
        return nodeContains(shadowChild, parent);
      }),
    ).toBe(false);
  });
});

test.describe("getLastElementChild()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setContent(`
      <div data-testid="light-parent">
        <span id="light-first"></span>
        <span id="light-last"></span>
      </div>
      <div data-testid="shadow-host">
        <template shadowrootmode="open">
          <span id="shadow-first"></span>
          <span id="shadow-last"></span>
        </template>
      </div>
      <div data-testid="empty"></div>
      <div data-testid="shadow-host2">
        <button id="slotted">slotted</button>
        <template shadowrootmode="open">
          <span id="shadow-first"></span>
          <span id="shadow-last"></span>
          <slot></slot>
        </template>
      </div>
    `);
  });

  test("should return the last element child for a light DOM element", async ({
    page,
  }) => {
    expect(
      await page.getByTestId("light-parent").evaluate(async (parent) => {
        const { getLastElementChild } = await import(
          "/src/shadow-utils/dom.js"
        );

        return getLastElementChild(parent) === parent.lastElementChild;
      }),
    ).toBe(true);
  });

  test("should return the last element child inside a shadow root", async ({
    page,
  }) => {
    expect(
      await page.getByTestId("shadow-host").evaluate(async (host) => {
        const { getLastElementChild } = await import(
          "/src/shadow-utils/dom.js"
        );

        return getLastElementChild(host)?.id;
      }),
    ).toBe("shadow-last");
  });

  test("should return null for an empty element", async ({ page }) => {
    expect(
      await page.getByTestId("empty").evaluate(async (node) => {
        const { getLastElementChild } = await import(
          "/src/shadow-utils/dom.js"
        );

        return getLastElementChild(node);
      }),
    ).toBeNull();
  });

  test("should consider slotted elements as part of the shadow tree", async ({
    page,
  }) => {
    expect(
      await page.getByTestId("shadow-host2").evaluate(async (host) => {
        const { getLastElementChild } = await import(
          "/src/shadow-utils/dom.js"
        );

        return getLastElementChild(host)?.id;
      }),
    ).toBe("slotted");
  });
});

test.describe("getLastElementDescendant()", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setContent(`
      <div id="light-parent">
        <div id="light-mid">
          <span id="light-deepest"></span>
        </div>
      </div>
      <div id="shadow-host">
        <template shadowrootmode="open">
          <div id="shadow-mid">
            <div id="shadow-inner-host">
              <template shadowrootmode="open">
                <span id="shadow-deepest"></span>
              </template>
            </div>
          </div>
        </template>
      </div>
      <div id="empty"></div>
    `);
  });

  test("should return the deepest last element child in light DOM", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { getLastElementDescendant } = await import(
          "/src/shadow-utils/dom.js"
        );
        return getLastElementDescendant(document.getElementById("light-parent"))
          ?.id;
      }),
    ).toBe("light-deepest");
  });

  test("should return the deepest last element child across nested shadow roots", async ({
    page,
  }) => {
    expect(
      await page.evaluate(async () => {
        const { getLastElementDescendant } = await import(
          "/src/shadow-utils/dom.js"
        );
        return getLastElementDescendant(document.getElementById("shadow-host"))
          ?.id;
      }),
    ).toBe("shadow-deepest");
  });

  test("should return null for an empty container", async ({ page }) => {
    expect(
      await page.evaluate(async () => {
        const { getLastElementDescendant } = await import(
          "/src/shadow-utils/dom.js"
        );
        return getLastElementDescendant(document.getElementById("empty"));
      }),
    ).toBeNull();
  });
});
