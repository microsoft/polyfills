// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FocusGroup } from "./focusgroup.js";
import { state } from "./global-state.js";
import { GridItemCollection } from "./grid-item-collection.js";
import {
  createMutationObserver,
  createTreeWalker,
  nodeContains,
} from "./shadow-utils/index.js";
import { TreeWalkerItemCollection } from "./tree-walker-item-collection.js";
import {
  hasDocument,
  inferRole,
  parseDefinition,
  shouldPolyfillV2,
  supportsFocusGroup,
} from "./utils.js";

let elementPolyfillMap;

if (hasDocument() && typeof MutationObserver !== "undefined") {
  /** @type {Map<HTMLElement, FocusGroup>} */
  elementPolyfillMap = state.m ??= new Map();

  if (!state.g) {
    // Observe shadow trees too: custom elements commonly render their
    // `focusgroup` element into a shadow root *after* the polyfill is
    // installed (e.g. Lit renders in a microtask following the upgrade), and
    // a plain `MutationObserver` never sees those additions. The shadowless
    // build swaps this for a plain `MutationObserver`.
    const observer = createMutationObserver((entries) => {
      for (const entry of entries) {
        if (entry.type === "attributes") {
          if (state.b) {
            polyfill(entry.target);
          }
          continue;
        }

        for (const node of entry.removedNodes) {
          for (const [owner, group] of elementPolyfillMap) {
            if (!owner.isConnected && nodeContains(node, owner)) {
              group?.disconnect();
              elementPolyfillMap.delete(owner);
            }
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
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["focusgroup"],
      childList: true,
      subtree: true,
    });
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
  if (!hasDocument()) {
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

  const pending = [];
  do {
    const element = walker.currentNode;

    // The walker's filter never runs on its own root, so `root` has to be
    // vetted here — otherwise every element passed to `polyfill()` (including
    // the default `<body>` and every node reported by the mutation observer)
    // would be treated as a focusgroup owner.
    if (
      !element.hasAttribute?.("focusgroup") ||
      elementPolyfillMap.has(element)
    ) {
      continue;
    }

    const definition = parseDefinition(element);
    if (
      !shouldPolyfillV2(definition.behavior) &&
      supportsFocusGroup(definition.behavior) &&
      (!definition.itemcontrols || supportsFocusGroup("itemcontrols"))
    ) {
      continue;
    }

    // Reserve the slot synchronously so a re-entrant polyfill() call (e.g.
    // from the global mutation observer) cannot schedule a duplicate
    // FocusGroup before the rAF callback below installs the real instance.
    elementPolyfillMap.set(element, null);
    pending.push(element);
  } while (walker.nextNode());

  // Descendants must establish their own tab stops before an ancestor can
  // decide which nested boundaries to filter.
  for (const element of pending.reverse()) {
    requestAnimationFrame(() => {
      // The element may have been removed (and its slot deleted) before the
      // rAF fired; bail out so we don't resurrect a tracking entry.
      if (!elementPolyfillMap.has(element)) {
        return;
      }
      const definition = parseDefinition(element);
      const createItems = (nextDefinition) =>
        nextDefinition.behavior === "grid"
          ? new GridItemCollection(element, nextDefinition.manual)
          : new TreeWalkerItemCollection(element, nextDefinition.itemcontrols);
      const items = createItems(definition);
      const fg = new FocusGroup(element, items, {
        definition,
        createItems,
        onNativeTakeover: (owner) => {
          elementPolyfillMap.delete(owner);
        },
        decorateOwner: (el, behavior, valid) =>
          inferRole(
            el,
            behavior === "grid" && valid === false ? null : behavior,
            "owner",
          ),
        decorateItem: (el, behavior) => {
          if (behavior !== "grid") {
            inferRole(el, behavior, "child");
          }
        },
      });
      elementPolyfillMap.set(element, fg);
      for (const [ancestor, group] of elementPolyfillMap) {
        if (ancestor !== element && group && nodeContains(ancestor, element)) {
          group.update();
        }
      }
    });
  }
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
