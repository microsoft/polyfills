import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test.describe("observing mutations inside shadow roots", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(`
        <div id="root">
          <div id="host">
            <template shadowrootmode="open">
              <div id="shadow-container"></div>
            </template>
          </div>
        </div>
      `);
  });

  test("should detect additions inside an existing shadow root", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { ShadowMutationObserver } = await import(
        "/src/shadow-utils/mutation-observer.js"
      );

      return new Promise((resolve) => {
        const observer = new ShadowMutationObserver((mutations) => {
          const added = mutations.flatMap((m) =>
            Array.from(m.addedNodes)
              .filter((n) => n.nodeType === Node.ELEMENT_NODE)
              .map((n) => n.id),
          );
          if (added.length > 0) {
            observer.disconnect();
            resolve(added);
          }
        });

        const root = document.getElementById("root");
        observer.observe(root, { childList: true, subtree: true });

        const container = document
          .getElementById("host")
          .shadowRoot.getElementById("shadow-container");
        const newEl = document.createElement("span");
        newEl.id = "added-in-shadow";
        container.appendChild(newEl);
      });
    });

    expect(result).toContain("added-in-shadow");
  });

  test("should detect removals inside an existing shadow root", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const { ShadowMutationObserver } = await import(
        "/src/shadow-utils/mutation-observer.js"
      );

      const container = document
        .getElementById("host")
        .shadowRoot.getElementById("shadow-container");
      const child = document.createElement("span");
      child.id = "to-remove";
      container.appendChild(child);

      // Wait a tick so the observer setup is clean
      await new Promise((r) => setTimeout(r, 0));

      return new Promise((resolve) => {
        const observer = new ShadowMutationObserver((mutations) => {
          const removed = mutations.flatMap((m) =>
            Array.from(m.removedNodes)
              .filter((n) => n.nodeType === Node.ELEMENT_NODE)
              .map((n) => n.id),
          );
          if (removed.length > 0) {
            observer.disconnect();
            resolve(removed);
          }
        });

        const root = document.getElementById("root");
        observer.observe(root, { childList: true, subtree: true });

        container.removeChild(child);
      });
    });

    expect(result).toContain("to-remove");
  });
});

test("should detect mutations inside a shadow root attached after observe()", async ({
  page,
}) => {
  await page.setContent(`
      <div id="root">
        <div id="future-host"></div>
      </div>
    `);

  const result = await page.evaluate(async () => {
    const { ShadowMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );

    return new Promise((resolve) => {
      const observer = new ShadowMutationObserver((mutations) => {
        const added = mutations.flatMap((m) =>
          Array.from(m.addedNodes)
            .filter((n) => n.nodeType === Node.ELEMENT_NODE)
            .map((n) => n.id),
        );
        if (added.includes("dynamic-shadow-child")) {
          observer.disconnect();
          resolve(true);
        }
      });

      const root = document.getElementById("root");
      observer.observe(root, { childList: true, subtree: true });

      const host = document.getElementById("future-host");
      const shadowRoot = host.attachShadow({ mode: "open" });
      const child = document.createElement("div");
      child.id = "dynamic-shadow-child";
      shadowRoot.appendChild(child);
    });
  });

  expect(result).toBe(true);
});

test("should detect mutations inside nested shadow roots", async ({ page }) => {
  await page.setContent(`
      <div id="root">
        <div id="outer-host">
          <template shadowrootmode="open">
            <div id="inner-host">
              <template shadowrootmode="open">
                <div id="deep-container"></div>
              </template>
            </div>
          </template>
        </div>
      </div>
    `);

  const result = await page.evaluate(async () => {
    const { ShadowMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );

    return new Promise((resolve) => {
      const observer = new ShadowMutationObserver((mutations) => {
        const added = mutations.flatMap((m) =>
          Array.from(m.addedNodes)
            .filter((n) => n.nodeType === Node.ELEMENT_NODE)
            .map((n) => n.id),
        );
        if (added.includes("deep-added")) {
          observer.disconnect();
          resolve(true);
        }
      });

      const root = document.getElementById("root");
      observer.observe(root, { childList: true, subtree: true });

      const deepContainer = document
        .getElementById("outer-host")
        .shadowRoot.getElementById("inner-host")
        .shadowRoot.getElementById("deep-container");
      const child = document.createElement("span");
      child.id = "deep-added";
      deepContainer.appendChild(child);
    });
  });

  expect(result).toBe(true);
});

test("disconnect() should stop observing shadow root mutations after disconnect", async ({
  page,
}) => {
  await page.setContent(`
      <div id="root">
        <div id="host">
          <template shadowrootmode="open">
            <div id="shadow-container"></div>
          </template>
        </div>
      </div>
    `);

  const result = await page.evaluate(async () => {
    const { ShadowMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );

    let callCount = 0;
    const observer = new ShadowMutationObserver(() => {
      callCount++;
    });

    const root = document.getElementById("root");
    observer.observe(root, { childList: true, subtree: true });
    observer.disconnect();

    const container = document
      .getElementById("host")
      .shadowRoot.getElementById("shadow-container");
    const child = document.createElement("span");
    container.appendChild(child);

    // Wait for any potential callback
    await new Promise((r) => setTimeout(r, 100));
    return callCount;
  });

  expect(result).toBe(0);
});

test("takeRecords() should return pending records from shadow sub-observers", async ({
  page,
}) => {
  await page.setContent(`
      <div id="root">
        <div id="host">
          <template shadowrootmode="open">
            <div id="shadow-container"></div>
          </template>
        </div>
      </div>
    `);

  const result = await page.evaluate(async () => {
    const { ShadowMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );

    const observer = new ShadowMutationObserver(() => {});

    const root = document.getElementById("root");
    observer.observe(root, { childList: true, subtree: true });

    const container = document
      .getElementById("host")
      .shadowRoot.getElementById("shadow-container");
    const child = document.createElement("span");
    child.id = "pending-child";
    container.appendChild(child);

    const records = observer.takeRecords();
    observer.disconnect();

    return records.some((r) =>
      Array.from(r.addedNodes).some(
        (n) => n.nodeType === Node.ELEMENT_NODE && n.id === "pending-child",
      ),
    );
  });

  expect(result).toBe(true);
});

test("should not fire callbacks for a removed shadow host", async ({
  page,
}) => {
  await page.setContent(`
      <div id="root">
        <div id="host-wrapper">
          <div id="host">
            <template shadowrootmode="open">
              <div id="shadow-container"></div>
            </template>
          </div>
        </div>
      </div>
    `);

  const result = await page.evaluate(async () => {
    const { ShadowMutationObserver } = await import(
      "/src/shadow-utils/mutation-observer.js"
    );

    let shadowCallbackCount = 0;

    const observer = new ShadowMutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.id === "after-removal"
          ) {
            shadowCallbackCount++;
          }
        }
      }
    });

    const root = document.getElementById("root");
    observer.observe(root, { childList: true, subtree: true });

    // Remove the host from the DOM — triggers cleanup
    const host = document.getElementById("host");
    const shadowContainer = host.shadowRoot.getElementById("shadow-container");
    host.remove();

    // Wait for the removal mutation to be processed
    await new Promise((r) => setTimeout(r, 50));

    // Now try to mutate the detached shadow container
    const child = document.createElement("span");
    child.id = "after-removal";
    shadowContainer.appendChild(child);

    await new Promise((r) => setTimeout(r, 100));
    observer.disconnect();
    return shadowCallbackCount;
  });

  expect(result).toBe(0);
});
