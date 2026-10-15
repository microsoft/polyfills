// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { FocusGroup } from "./focusgroup.js";
import { state } from "./global-state.js";
import { GridItemCollection } from "./grid-item-collection.js";
import { batchWrites } from "./observer-registry.js";
import {
  createMutationObserver,
  createTreeWalker,
  getParentElement,
} from "./shadow-utils/index.js";
import { TreeWalkerItemCollection } from "./tree-walker-item-collection.js";
import {
  hasDocument,
  inferRole,
  parseDefinition,
  shouldDeferToNative,
} from "./utils.js";

let elementPolyfillMap;

if (hasDocument() && typeof MutationObserver !== "undefined") {
  /** @type {Map<HTMLElement, FocusGroup>} */
  elementPolyfillMap = state.m ??= new Map();

  // Legacy bundles may already own `g`; install the current removal protocol
  // independently so their containment-based cleanup cannot suppress it.
  if (!state.r) {
    // Owners torn down while detached. Detached DOM is often reinserted later
    // (cached tabs, `<KeepAlive>`, virtualized lists), and `polyfill()` alone
    // does not observe additions, so reinstate exactly these owners when they
    // return. Weak references let permanently removed subtrees be collected.
    /** @type {Set<WeakRef<HTMLElement>>} */
    const swept = new Set();
    const removalObserver = createMutationObserver((entries) => {
      if (entries.some((entry) => entry.removedNodes.length)) {
        for (const [owner, group] of elementPolyfillMap) {
          if (!owner.isConnected) {
            group?.disconnect();
            elementPolyfillMap.delete(owner);
            swept.add(new WeakRef(owner));
          }
        }
      }
      if (!swept.size || !entries.some((entry) => entry.addedNodes.length)) {
        return;
      }
      const restored = [];
      for (const ref of swept) {
        const owner = ref.deref();
        if (!owner) {
          swept.delete(ref);
        } else if (owner.isConnected) {
          swept.delete(ref);
          restored.push(owner);
        }
      }
      // Ancestors first, matching the walker order `queueOwners()` expects.
      restored.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
      queueOwners(restored);
    });
    removalObserver.observe(document.body, { childList: true, subtree: true });
    state.r = removalObserver;
  }
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

  const candidates = [];
  do {
    candidates.push(/** @type {HTMLElement} */ (walker.currentNode));
  } while (walker.nextNode());
  queueOwners(candidates);
}

/**
 * Reserves and schedules FocusGroups for `elements`, given in tree order.
 * @param {HTMLElement[]} elements
 */
function queueOwners(elements) {
  const pending = [];
  for (const element of elements) {
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

    if (shouldDeferToNative(parseDefinition(element))) {
      continue;
    }

    // Reserve the slot synchronously so a re-entrant polyfill() call (e.g.
    // from the global mutation observer) cannot schedule a duplicate
    // FocusGroup before the rAF callback below installs the real instance.
    elementPolyfillMap.set(element, null);
    pending.push(element);
  }

  // Descendants must establish their own tab stops before an ancestor can
  // decide which nested boundaries to filter.
  initQueue.push(...pending.reverse());
  if (pending.length && !initScheduled) {
    initScheduled = true;
    requestAnimationFrame(initPending);
  }
}

/** @type {HTMLElement[]} */
let initQueue = [];
let initScheduled = false;

/**
 * Creates every FocusGroup queued in this frame in one batch of managed
 * writes, then reconciles each affected ancestor once. Updating ancestors
 * per created descendant would rebuild a feed once per nested toolbar.
 */
function initPending() {
  const queue = initQueue;
  initQueue = [];
  initScheduled = false;
  batchWrites(() => {
    /** @type {Map<HTMLElement, number>} */
    const created = new Map();
    for (const element of queue) {
      const fg = createFocusGroup(element);
      if (fg) {
        created.set(element, created.size);
      }
    }
    // An ancestor created after its descendant already saw it.
    const stale = new Set();
    for (const [element, index] of created) {
      // Walk ancestors rather than scanning every tracked owner, which would
      // make initial polyfilling quadratic in the number of owners.
      for (
        let ancestor = getParentElement(element);
        ancestor;
        ancestor = getParentElement(ancestor)
      ) {
        if (
          elementPolyfillMap.get(ancestor) &&
          !((created.get(ancestor) ?? -1) > index)
        ) {
          stale.add(ancestor);
        }
      }
    }
    for (const ancestor of stale) {
      elementPolyfillMap.get(ancestor)?.update();
    }
  });
}

/** @param {HTMLElement} element */
function createFocusGroup(element) {
  // The element may have been removed (and its slot deleted) before the
  // rAF fired; bail out so we don't resurrect a tracking entry.
  if (!elementPolyfillMap.has(element) || elementPolyfillMap.get(element)) {
    return null;
  }
  const definition = parseDefinition(element);
  if (shouldDeferToNative(definition)) {
    elementPolyfillMap.delete(element);
    return null;
  }
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
  return fg;
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
