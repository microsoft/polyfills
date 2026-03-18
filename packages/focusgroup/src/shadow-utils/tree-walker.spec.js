import { expect, test } from "@playwright/test";
import { setupPage } from "../../tests/utils";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("nextNode() across shadow boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="host1">
            <template shadowrootmode="open">
              <span id="shadow1-a"></span>
              <span id="shadow1-b"></span>
            </template>
          </div>
          <div id="light-after"></div>
        </div>
      `);
  });

  test("should walk into a shadow root and return shadow children", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["host1", "shadow1-a", "shadow1-b", "light-after"]);
  });

  test("should accept a filter function and skip non-matching nodes", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
        (node) =>
          node.id.startsWith("shadow1")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow1-a", "shadow1-b"]);
  });

  test("should accept a filter object with acceptNode method", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            return node.id === "light-after"
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        },
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["light-after"]);
  });
});

test.describe("nextNode() with nested shadow roots", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="outer-host">
            <template shadowrootmode="open">
              <div id="inner-host">
                <template shadowrootmode="open">
                  <span id="deep-child"></span>
                </template>
              </div>
              <span id="outer-shadow-sibling"></span>
            </template>
          </div>
        </div>
      `);
  });

  test("should walk through nested shadow roots in tree order", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual([
      "outer-host",
      "inner-host",
      "deep-child",
      "outer-shadow-sibling",
    ]);
  });
});

test.describe("nextNode() with slotted children", () => {
  test("should consider slotted elements as children of their assigned slot element’s parent", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="root">
        <div id="slotted-last" slot="end"></div>
        <div id="slotted-before">
          <div id="slotted-before-child"></div>
        </div>
        <template shadowrootmode="open">
          <div id="shadow-before"></div>
          <slot></slot>
          <div id="shadow-after"></div>
          <slot name="end"></slot>
        </template>
        <div id="slotted-after">
          <div id="slotted-after-child"></div>
        </div>
      </div>
    `);

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual([
      "shadow-before",
      "slotted-before",
      "slotted-before-child",
      "slotted-after",
      "slotted-after-child",
      "shadow-after",
      "slotted-last",
    ]);
  });

  test("should ignore light DOM children if they aren’t assigned to any slot", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="root">
        <div id="slotted-before"></div>
        <template shadowrootmode="open">
          <div id="shadow-before"></div>
          <div id="shadow-after"></div>
        </template>
        <div id="slotted-after"></div>
      </div>
    `);

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow-before", "shadow-after"]);
  });

  test("should move to the next slotted or shadow element when started from the middle", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div id="root">
          <template shadowrootmode="open">
            <div id="shadow-before"></div>
            <slot></slot>
            <div id="shadow-after"></div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-middle");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-middle", "slotted-after", "shadow-after"]);
  });

  test("should move to the next shadow element when started from the last slotted element", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div id="root">
          <template shadowrootmode="open">
            <div id="shadow-before"></div>
            <slot></slot>
            <div id="shadow-after"></div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-after");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-after", "shadow-after"]);
  });

  test("should move to the next slotted or shadow element when started from the middle and root is inside a shadow tree", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div>
          <template shadowrootmode="open">
            <div data-testid="root">
              <div id="shadow-before"></div>
              <slot></slot>
              <div id="shadow-after"></div>
            </div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.getByTestId("root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-middle");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-middle", "slotted-after", "shadow-after"]);
  });

  test("should move to the next shadow element when started from the last slotted element and root is inside a shadow tree", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div>
          <template shadowrootmode="open">
            <div data-testid="root">
              <div id="shadow-before"></div>
              <slot></slot>
              <div id="shadow-after"></div>
            </div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.getByTestId("root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-after");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-after", "shadow-after"]);
  });

  test("should walk the slotted chidren in order", async ({ page }) => {
    await setupPage(
      page,
      `
      <div id="root">
        <template shadowrootmode="open">
          <slot></slot>
        </template>
        <div id="slotted-1"></div>
        <div id="slotted-2"></div>
        <div id="slotted-3"></div>
        <div id="slotted-4"></div>
      </div>
    `,
    );

    const ids = await page.locator("#root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual([
      "root",
      "slotted-1",
      "slotted-2",
      "slotted-3",
      "slotted-4",
    ]);
  });
});

test.describe("previousNode() across shadow boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="host">
            <template shadowrootmode="open">
              <span id="shadow-a"></span>
              <span id="shadow-b"></span>
            </template>
          </div>
          <div id="light-after"></div>
        </div>
      `);
  });

  test("should walk backwards through shadow boundaries", async ({ page }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      // Walk forward to the end first
      while (walker.nextNode()) {}
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow-b", "shadow-a", "host", "root"]);
  });

  test("should return null when at the beginning", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      return walker.previousNode();
    });

    expect(result).toBeNull();
  });
});

test.describe("previousNode() with nested shadow roots", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="outer-host">
            <template shadowrootmode="open">
              <div id="inner-host">
                <template shadowrootmode="open">
                  <span id="deep-child"></span>
                </template>
              </div>
              <span id="outer-shadow-sibling"></span>
            </template>
          </div>
        </div>
      `);
  });

  test("should walk backwards through nested shadow roots", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {}
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["deep-child", "inner-host", "outer-host", "root"]);
  });
});

test.describe("previousnNode() with slotted children", () => {
  test("should consider slotted elements as children of their assigned slot element’s parent", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="root">
        <div id="slotted-before">
          <div id="slotted-before-child"></div>
        </div>
        <template shadowrootmode="open">
          <slot name="start"></slot>
          <div id="shadow-before"></div>
          <slot></slot>
          <div id="shadow-after"></div>
        </template>
        <div id="slotted-after">
          <div id="slotted-after-child"></div>
        </div>
        <div id="slotted-first" slot="start"></div>
      </div>
    `);

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {}
      const result = [];
      result.push(walker.currentNode.id);
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual([
      "shadow-after",
      "slotted-after-child",
      "slotted-after",
      "slotted-before-child",
      "slotted-before",
      "shadow-before",
      "slotted-first",
      "root",
    ]);
  });

  test("should ignore light DOM children if they aren’t assigned to any slot", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="root">
        <div id="slotted-before"></div>
        <template shadowrootmode="open">
          <div id="shadow-before"></div>
          <div id="shadow-after"></div>
        </template>
        <div id="slotted-after"></div>
      </div>
    `);

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {}
      const result = [];
      result.push(walker.currentNode.id);
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow-after", "shadow-before", "root"]);
  });

  test("should move to the previous slotted or shadow element when started from the middle", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div id="root">
          <template shadowrootmode="open">
            <div id="shadow-before"></div>
            <slot></slot>
            <div id="shadow-after"></div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-middle");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual([
      "slotted-middle",
      "slotted-before",
      "shadow-before",
      "root",
    ]);
  });

  test("should move to the previous shadow element when started from the first slotted element", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div id="root">
          <template shadowrootmode="open">
            <div id="shadow-before"></div>
            <slot></slot>
            <div id="shadow-after"></div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-before");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-before", "shadow-before", "root"]);
  });

  test("should move to the previous slotted or shadow element when started from the middle and root is inside a shadow tree", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div>
          <template shadowrootmode="open">
            <div id="root" data-testid="root">
              <div id="shadow-before"></div>
              <slot></slot>
              <div id="shadow-after"></div>
            </div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.getByTestId("root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-middle");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual([
      "slotted-middle",
      "slotted-before",
      "shadow-before",
      "root",
    ]);
  });

  test("should move to the previous shadow element when started from the first slotted element and root is inside a shadow tree", async ({
    page,
  }) => {
    await setupPage(
      page,
      `
        <div>
          <template shadowrootmode="open">
            <div id="root" data-testid="root">
              <div id="shadow-before"></div>
              <slot></slot>
              <div id="shadow-after"></div>
            </div>
          </template>
          <div id="slotted-before"></div>
          <div id="slotted-middle"></div>
          <div id="slotted-after"></div>
        </div>
      `,
    );

    const ids = await page.getByTestId("root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-before");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual(["slotted-before", "shadow-before", "root"]);
  });

  test("should walk the slotted chidren in order", async ({ page }) => {
    await setupPage(
      page,
      `
      <div id="root">
        <template shadowrootmode="open">
          <slot></slot>
        </template>
        <div id="slotted-1"></div>
        <div id="slotted-2"></div>
        <div id="slotted-3"></div>
        <div id="slotted-4"></div>
      </div>
    `,
    );

    const ids = await page.locator("#root").evaluate(async (root) => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      walker.currentNode = document.getElementById("slotted-4");

      const result = [];
      result.push(walker.currentNode.id);

      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }

      return result;
    });

    expect(ids).toEqual([
      "slotted-4",
      "slotted-3",
      "slotted-2",
      "slotted-1",
      "root",
    ]);
  });
});

test.describe("previousNode() when root is a shadow host", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <template shadowrootmode="open">
            <span id="a"></span>
            <span id="b"></span>
            <span id="c"></span>
          </template>
        </div>
      `);
  });

  test("should walk backwards after forward walk to a mid-point", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode() && walker.currentNode.id !== "c") {}
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["b", "a", "root"]);
  });

  test("should walk backwards after forward exhaustion", async ({ page }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {}
      walker.nextNode();
      const result = [];
      result.push(walker.currentNode.id);
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["c", "b", "a", "root"]);
  });

  test("should walk backwards from a position set via currentNode setter", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      walker.currentNode = root.shadowRoot.getElementById("c");
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["b", "a", "root"]);
  });

  test("should handle alternating forward and backward walks", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      // Walk forward to b, then backward, then forward again to c, then backward
      const result = [];
      while (walker.nextNode() && walker.currentNode.id !== "b") {}
      result.push(walker.currentNode.id);
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["b", "a", "root", "a", "b", "c", "b", "a", "root"]);
  });
});

test.describe("currentNode setter across shadow boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="host">
            <template shadowrootmode="open">
              <span id="shadow-first"></span>
              <span id="shadow-target"></span>
              <span id="shadow-last"></span>
            </template>
          </div>
        </div>
      `);
  });

  test("should allow setting currentNode to a node inside a shadow root", async ({
    page,
  }) => {
    const id = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const target = document
        .getElementById("host")
        .shadowRoot.getElementById("shadow-target");
      walker.currentNode = target;
      return walker.currentNode.id;
    });

    expect(id).toBe("shadow-target");
  });

  test("should continue walking forward from a node set inside shadow DOM", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const target = document
        .getElementById("host")
        .shadowRoot.getElementById("shadow-target");
      walker.currentNode = target;
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow-last"]);
  });

  test("should continue walking backward from a node set inside shadow DOM", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const target = document
        .getElementById("host")
        .shadowRoot.getElementById("shadow-target");
      walker.currentNode = target;
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["shadow-first", "host", "root"]);
  });

  test("should throw when setting currentNode to a node outside the root", async ({
    page,
  }) => {
    const threw = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      try {
        walker.currentNode = document.body;
        return false;
      } catch {
        return true;
      }
    });

    expect(threw).toBe(true);
  });
});

test.describe("multiple shadow hosts at the same level", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="host-a">
            <template shadowrootmode="open">
              <span id="shadow-a1"></span>
            </template>
          </div>
          <div id="host-b">
            <template shadowrootmode="open">
              <span id="shadow-b1"></span>
            </template>
          </div>
        </div>
      `);
  });

  test("should walk through sibling shadow hosts in order", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["host-a", "shadow-a1", "host-b", "shadow-b1"]);
  });

  test("should walk backwards through sibling shadow hosts", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const root = document.getElementById("root");
      const walker = new ShadowTreeWalker(
        document,
        root,
        NodeFilter.SHOW_ELEMENT,
      );
      while (walker.nextNode()) {}
      const result = [];
      while (walker.previousNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual(["host-b", "shadow-a1", "host-a", "root"]);
  });
});

test.describe("shadow host as the walker root", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="host">
          <template shadowrootmode="open">
            <span id="shadow-child-a"></span>
            <div id="nested-host">
              <template shadowrootmode="open">
                <span id="nested-shadow-child"></span>
              </template>
            </div>
          </template>
        </div>
      `);
  });

  test("should walk a shadow root used as the root, including nested shadow children", async ({
    page,
  }) => {
    const ids = await page.evaluate(async () => {
      const { ShadowTreeWalker } = await import("/src/main.js");
      const host = document.getElementById("host");
      const walker = new ShadowTreeWalker(
        document,
        host,
        NodeFilter.SHOW_ELEMENT,
      );
      const result = [];
      while (walker.nextNode()) {
        result.push(walker.currentNode.id);
      }
      return result;
    });

    expect(ids).toEqual([
      "shadow-child-a",
      "nested-host",
      "nested-shadow-child",
    ]);
  });
});

test("shadow host with multiple shadow containing children should walk in DOM order", async ({
  page,
}) => {
  await page.setContent(`
    <my-tablist focusgroup="tablist" id="tablist">
      <template shadowrootmode="open">
        <slot></slot>
      </template>
      <my-tab tabindex="0" id="tab1">
        <template shadowrootmode="open">
          <slot></slot>
        </template>
        tab 1
      </my-tab>
      <my-tab tabindex="0" id="tab2">
        <template shadowrootmode="open">
          <slot></slot>
        </template>
        tab 2
      </my-tab>
      <my-tab tabindex="0" id="tab3">
        <template shadowrootmode="open">
          <slot></slot>
        </template>
        tab 3
      </my-tab>
    </my-tablist>
  `);

  const ids = await page.evaluate(async () => {
    const { ShadowTreeWalker } = await import("/src/main.js");
    const tablist = document.getElementById("tablist");
    const walker = new ShadowTreeWalker(
      document,
      tablist,
      NodeFilter.SHOW_ELEMENT,
    );

    const result = [];
    result.push(walker.currentNode.id);
    while (walker.nextNode()) {
      result.push(walker.currentNode.id);
    }
    while (walker.previousNode()) {
      result.push(walker.currentNode.id);
    }
    return result;
  });

  expect(ids).toEqual([
    "tablist",
    "tab1",
    "tab2",
    "tab3",
    "tab2",
    "tab1",
    "tablist",
  ]);
});

test("should walk shadow children of slotted hosts before next slotted sibling", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <div id="root">
      <div id="item1">
        <template shadowrootmode="open">
          <slot></slot>
          <div id="item1-subtree">
            <slot name="item"></slot>
          </div>
        </template>
        item 1
        <div slot="item" id="item1-subtree-1">
          <template shadowrootmode="open">
            <slot></slot>
            <div id="item1-subtree-1-subtree">
              <slot name="item"></slot>
            </div>
          </template>
          item 1.1
          <div slot="item" id="item1-subtree-1-subtree-1">
            <template shadowrootmode="open">
              <slot></slot>
              <div id="item1-subtree-1-subtree-1-subtree">
                <slot name="item"></slot>
              </div>
            </template>
            item 1.1.1
          </div>
          <div slot="item" id="item1-subtree-1-subtree-2">
            <template shadowrootmode="open">
              <slot></slot>
              <div id="item1-subtree-1-subtree-2-subtree">
                <slot name="item"></slot>
              </div>
            </template>
            item 1.1.2
          </div>
        </div>
        <div slot="item" id="item1-subtree-2">
          <template shadowrootmode="open">
            <slot></slot>
            <div id="item1-subtree-2-subtree">
              <slot name="item"></slot>
            </div>
          </template>
          item 1.2
        </div>
      </div>
      <div id="item2">
        <template shadowrootmode="open">
          <slot></slot>
          <div id="item2-subtree">
            <slot name="item"></slot>
          </div>
        </template>
        item 2
      </div>
      <div id="item3">
        <template shadowrootmode="open">
          <slot></slot>
          <div id="item3-subtree">
            <slot name="item"></slot>
          </div>
        </template>
        item 3
        <div slot="item" id="item3-subtree-1">
          <template shadowrootmode="open">
            <slot></slot>
            <div id="item3-subtree-1-subtree">
              <slot name="item"></slot>
            </div>
          </template>
          item 3.1
        </div>
        <div slot="item" id="item3-subtree-2">
          <template shadowrootmode="open">
            <slot></slot>
            <div id="item3-subtree-2-subtree">
              <slot name="item"></slot>
            </div>
          </template>
          item 3.2
        </div>
      </div>
    </div>
  `,
  );

  const ids = await page.evaluate(async () => {
    const { ShadowTreeWalker } = await import("/src/main.js");
    const root = document.getElementById("root");
    const walker = new ShadowTreeWalker(
      document,
      root,
      NodeFilter.SHOW_ELEMENT,
    );

    const result = [];
    result.push(walker.currentNode.id);
    while (walker.nextNode()) {
      result.push(walker.currentNode.id);
    }
    while (walker.previousNode()) {
      result.push(walker.currentNode.id);
    }
    while (walker.nextNode()) {
      result.push(walker.currentNode.id);
    }

    while (walker.previousNode()) {
      if (walker.currentNode.id === "item1-subtree-1") {
        result.push(walker.currentNode.id);
        break;
      }
    }
    walker.nextNode();
    result.push(walker.currentNode.id);

    return result;
  });

  expect(ids).toEqual([
    // nextNode()
    "root",
    "item1",
    "item1-subtree",
    "item1-subtree-1",
    "item1-subtree-1-subtree",
    "item1-subtree-1-subtree-1",
    "item1-subtree-1-subtree-1-subtree",
    "item1-subtree-1-subtree-2",
    "item1-subtree-1-subtree-2-subtree",
    "item1-subtree-2",
    "item1-subtree-2-subtree",
    "item2",
    "item2-subtree",
    "item3",
    "item3-subtree",
    "item3-subtree-1",
    "item3-subtree-1-subtree",
    "item3-subtree-2",
    "item3-subtree-2-subtree",
    // previousNode()
    "item3-subtree-2",
    "item3-subtree-1-subtree",
    "item3-subtree-1",
    "item3-subtree",
    "item3",
    "item2-subtree",
    "item2",
    "item1-subtree-2-subtree",
    "item1-subtree-2",
    "item1-subtree-1-subtree-2-subtree",
    "item1-subtree-1-subtree-2",
    "item1-subtree-1-subtree-1-subtree",
    "item1-subtree-1-subtree-1",
    "item1-subtree-1-subtree",
    "item1-subtree-1",
    "item1-subtree",
    "item1",
    "root",
    // nextNode()
    "item1",
    "item1-subtree",
    "item1-subtree-1",
    "item1-subtree-1-subtree",
    "item1-subtree-1-subtree-1",
    "item1-subtree-1-subtree-1-subtree",
    "item1-subtree-1-subtree-2",
    "item1-subtree-1-subtree-2-subtree",
    "item1-subtree-2",
    "item1-subtree-2-subtree",
    "item2",
    "item2-subtree",
    "item3",
    "item3-subtree",
    "item3-subtree-1",
    "item3-subtree-1-subtree",
    "item3-subtree-2",
    "item3-subtree-2-subtree",
    // Back and forth
    "item1-subtree-1",
    "item1-subtree-1-subtree",
  ]);
});

test("should enter shadow children after repositioning currentNode to a shadow host", async ({
  page,
}) => {
  await setupPage(
    page,
    `
    <div id="root">
      <div id="host-a">
        <template shadowrootmode="open">
          <span id="shadow-a1"></span>
          <span id="shadow-a2"></span>
        </template>
      </div>
      <div id="host-b">
        <template shadowrootmode="open">
          <span id="shadow-b1"></span>
        </template>
      </div>
    </div>
  `,
  );

  const ids = await page.evaluate(async () => {
    const { ShadowTreeWalker } = await import("/src/main.js");
    const root = document.getElementById("root");
    const walker = new ShadowTreeWalker(
      document,
      root,
      NodeFilter.SHOW_ELEMENT,
    );

    // Walk forward to the end.
    while (walker.nextNode()) {}

    // Simulate a wrap-around: reposition to the first shadow host.
    walker.currentNode = document.getElementById("host-a");

    // Walk forward again — should enter host-a's shadow children.
    const result = [];
    while (walker.nextNode()) {
      result.push(walker.currentNode.id);
    }
    return result;
  });

  expect(ids).toEqual(["shadow-a1", "shadow-a2", "host-b", "shadow-b1"]);
});
