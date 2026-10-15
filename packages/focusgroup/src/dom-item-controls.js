// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DatasetName } from "./constants.js";
import { state } from "./global-state.js";
import { managedTabindex } from "./item-controls.js";
import { hasIndexedObserver } from "./observer-registry.js";
import {
  createTreeWalker,
  getParentElement,
  nodeContains,
} from "./shadow-utils/index.js";
import {
  checkVisibility,
  hasNegativeTabIndex,
  isKeyboardFocusable,
  isTopLayer,
  parseDefinition,
} from "./utils.js";

/**
 * DOM-backed item-control discovery for the built-in collections. Applications
 * with their own item model can supply the same interface without tree walking.
 */
export class DOMItemControls {
  #owner;
  #items;

  /**
   * @param {HTMLElement} owner
   * @param {import("./focusgroup-items.js").FocusGroupItemCollection} items
   */
  constructor(owner, items) {
    this.#owner = owner;
    this.#items = items;
  }

  *items() {
    const walker = createTreeWalker(
      this.#owner.ownerDocument,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
    );
    while (walker.nextNode()) {
      const element = /** @type {HTMLElement} */ (walker.currentNode);
      const item = this.itemForNode(element);
      if (item && this.#isEligible(element)) {
        yield { element, item };
      }
    }
  }

  /** @param {Element} element */
  itemForNode(element) {
    if (!nodeContains(this.#owner, element)) {
      return null;
    }
    let nestedOwner = null;
    let optOut = null;
    for (
      let ancestor = element;
      ancestor && ancestor !== this.#owner;
      ancestor = getParentElement(ancestor)
    ) {
      if (isTopLayer(ancestor) || ancestor.matches?.("[inert]")) {
        return null;
      }
      if (ancestor.hasAttribute?.("focusgroup")) {
        if (ancestor.getAttribute("focusgroup").split(/\s+/).includes("none")) {
          optOut ??= ancestor;
        } else if (parseDefinition(ancestor).behavior) {
          nestedOwner ??= ancestor;
        }
      }
    }
    // Nested owners associate through every enclosing owner; opt-outs stop
    // at their nearest owner.
    const boundary = nestedOwner ?? optOut;
    return boundary ? (this.#items.itemForNode?.(boundary) ?? null) : null;
  }

  /** @param {HTMLElement} element */
  #isEligible(element) {
    for (
      let parent = element;
      parent && parent !== this.#owner;
      parent = getParentElement(parent)
    ) {
      if (state.m?.has(parent)) {
        // Older observers do not share the indexed batching protocol.
        // Preserve their rovers rather than mixing control reconciliation.
        if (!state.m.get(parent) || !hasIndexedObserver(parent)) {
          return false;
        }
      }
    }
    // Include inactive nested rovers: their underlying stop can change while
    // an enclosing owner suppresses them.
    if (element.hasAttribute(DatasetName.AUTHOR_TABINDEX)) {
      return !element.disabled && checkVisibility(element, this.#owner);
    }
    const saved = managedTabindex(element);
    return (
      !hasNegativeTabIndex(element, saved) &&
      isKeyboardFocusable(element, this.#owner, true, saved)
    );
  }
}
