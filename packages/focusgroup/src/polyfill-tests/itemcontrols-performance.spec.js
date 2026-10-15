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

test("1000-article feed with nested toolbars reconciles in linear time", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Chromium benchmark");
  const article = (id) => `
    <article tabindex="0" data-testid="${id}">
      Article ${id}
      <div focusgroup="toolbar">
        <button>Like</button><button>Share</button><button>More</button>
      </div>
    </article>`;
  await setupPage(
    page,
    testInfo.project,
    `<div focusgroup="feed" data-testid="feed">
       ${Array.from({ length: 1000 }, (_, i) => article(`item-${i}`)).join("")}
     </div>`,
  );
  await page.getByTestId("item-500").focus();
  const results = await page.evaluate(async () => {
    const { polyfill } = await import("/build/index.mjs");
    const article = (id) => `
      <article tabindex="0">
        Article ${id}
        <div focusgroup="toolbar">
          <button>Like</button><button>Share</button><button>More</button>
        </div>
      </article>`;
    const feed = document.querySelector('[data-testid="feed"]');
    const frame = () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
    const state = globalThis.__FOCUSGROUP_POLYFILL__;
    let captures = 0;
    const instrumented = new Set();
    const instrument = () => {
      for (const observer of state.p) {
        if (instrumented.has(observer)) {
          continue;
        }
        instrumented.add(observer);
        const capture = observer.capture.bind(observer);
        observer.capture = () => {
          captures++;
          capture();
        };
      }
    };
    const samples = { reconcile: [], append: [], arrow: [] };
    const captureCounts = [];
    for (let i = 0; i < 7; i++) {
      instrument();
      captures = 0;
      let start = performance.now();
      feed.children[3].append(document.createTextNode("!"));
      await frame();
      samples.reconcile.push(performance.now() - start);
      captureCounts.push({ captures, observers: state.p.size });

      start = performance.now();
      feed.insertAdjacentHTML(
        "beforeend",
        Array.from({ length: 20 }, (_, j) => article(`new-${i}-${j}`)).join(""),
      );
      // setupPage() installs existing groups without automatic discovery.
      polyfill(feed);
      await frame();
      await frame();
      samples.append.push(performance.now() - start);
      if (state.p.size !== 1001 + (i + 1) * 20) {
        throw new Error("Appended nested toolbars were not initialized");
      }

      start = performance.now();
      document.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      );
      samples.arrow.push(performance.now() - start);
      await frame();
    }
    return { samples, captureCounts };
  });
  await testInfo.attach("nested-feed-timings", {
    body: JSON.stringify(results),
    contentType: "application/json",
  });
  console.log(JSON.stringify(results));
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  // Capture overlapping owners around writes to preserve synchronous author
  // reactions. With fixed-depth toolbars this remains linear (~14 per owner),
  // rather than capturing every sibling observer on every write (~13 million).
  for (const { captures, observers } of results.captureCounts) {
    expect(captures).toBeLessThan(observers * 16);
  }
  expect(median(results.samples.reconcile)).toBeLessThan(500);
  expect(median(results.samples.append)).toBeLessThan(800);
  expect(median(results.samples.arrow)).toBeLessThan(16);
  await expect(page.getByTestId("item-507")).toBeFocused();
});
