// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FocusGroup } from "./focusgroup.js";
import { state } from "./global-state.js";
import { createTreeWalker } from "./shadow-utils/index.js";
import { TreeWalkerItemCollection } from "./tree-walker-item-collection.js";
import { hasDocument, supportsFocusGroup } from "./utils.js";

let elementPolyfillMap;

if (
  hasDocument() &&
  typeof MutationObserver !== "undefined" &&
  !supportsFocusGroup()
) {
  /** @type {Map<HTMLElement, FocusGroup>} */
  elementPolyfillMap = state.m ??= new Map();

  if (!state.g) {
    // Only observe light DOM for perfoamance.
    const observer = new MutationObserver((entries) => {
      for (const entry of entries) {
        if (entry.type !== "childList") {
          continue;
        }

        for (const node of entry.removedNodes) {
          if (elementPolyfillMap.has(node)) {
            elementPolyfillMap.get(node).disconnect();
            elementPolyfillMap.delete(node);
          }
        }

        if (!state.b) {
          continue;
        }

        for (const node of entry.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            polyfill(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    state.g = observer;
  }
}

/**
 * Polyfills the `focusgroup` HTML attribute for the given element and its
 * descendants.
 *
 * @param {HTMLElement} root - The polyfill target. Defaults to `<body>`.
 */
export function polyfill(root) {
  if (supportsFocusGroup() || !hasDocument()) {
    return;
  }

  root ??= document.body;

  const walker = createTreeWalker(
    document,
    root,
    NodeFilter.SHOW_ELEMENT,
    (node) =>
      node.hasAttribute("focusgroup")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );

  do {
    const element = walker.currentNode;

    if (elementPolyfillMap.has(element)) {
      continue;
    }

    // Make sure the element is ready during initial polyfilling.
    requestAnimationFrame(() => {
      const items = new TreeWalkerItemCollection(element);
      const fg = new FocusGroup(element, items);
      items.observe(fg);
      elementPolyfillMap.set(element, fg);
    });
  } while (walker.nextNode());
}

/**
 * Polyfills all potential focusgroups in `document.body`, observes DOM changes,
 * and polyfills any newly added focusgroups.
 */
export function polyfillBodyAndObserve() {
  if (!hasDocument()) {
    return;
  }

  state.b = true;
  polyfill();
}
