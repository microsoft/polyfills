// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test } from "@playwright/test";
import { expect, setupPage } from "./utils.js";

test("1000-article feed class/style toggles avoid full redecoration", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Chromium benchmark");
  await setupPage(
    page,
    testInfo.project,
    `<style>.highlight { color: rgb(20, 30, 40); }</style>
     <div focusgroup="feed" data-testid="feed">
       ${Array.from(
         { length: 1000 },
         (_, i) => `
         <article tabindex="0" data-testid="item-${i}">
           Article ${i}<button focusgroup="none">Action ${i}</button>
         </article>`,
       ).join("")}
     </div>`,
  );
  await page.getByTestId("item-500").focus();
  const results = await page.evaluate(async () => {
    const feed = document.querySelector('[data-testid="feed"]');
    const item = feed.children[500];
    const channel = new MessageChannel();
    const settle = () =>
      new Promise((resolve) => {
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(null);
      });
    const samples = { class: [], style: [] };
    let managedWrites = 0;
    let measuring = false;
    const observer = new MutationObserver((records) => {
      if (measuring) {
        managedWrites += records.length;
      }
    });
    observer.observe(feed, {
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "tabindex", "data-fg-item", "data-fg-ati"],
    });
    for (const attribute of ["class", "style"]) {
      for (let i = 0; i < 25; i++) {
        measuring = i >= 5;
        const start = performance.now();
        if (attribute === "class") {
          item.classList.toggle("highlight");
        } else {
          item.style.color = i % 2 ? "red" : "blue";
        }
        await settle();
        if (i >= 5) {
          samples[attribute].push(performance.now() - start);
        }
      }
    }
    observer.disconnect();
    channel.port1.close();
    channel.port2.close();
    return { samples, managedWrites };
  });
  await testInfo.attach("1000-article-mutation-timings", {
    body: JSON.stringify(results),
    contentType: "application/json",
  });
  console.log(JSON.stringify(results));
  for (const samples of Object.values(results.samples)) {
    const sorted = [...samples].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(8);
  }
  expect(results.managedWrites).toBe(0);
  await expect(page.getByTestId("item-500")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("item-501")).toBeFocused();
});
