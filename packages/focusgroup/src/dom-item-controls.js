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
 * @typedef {Object} ControlContext
 * @property {Element|null} nestedOwner - Nearest independent nested owner.
 * @property {Element|null} optOut - Nearest `focusgroup="none"` boundary.
 * @property {boolean} legacy - Inside an owner from an incompatible bundle.
 * @property {Element|null} boundary - The association path's starting point.
 */

/** @type {ControlContext} */
const ROOT_CONTEXT = {
  nestedOwner: null,
  optOut: null,
  legacy: false,
  boundary: null,
};

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
    // One walk resolves every element's ancestor context. Sharing it between
    // siblings keeps discovery linear rather than walking each element's
    // ancestors again, which dominated reconciliation in large feeds.
    const contexts = new Map();
    /** @type {Map<Element, HTMLElement|null>} */
    const boundaryItems = new Map();
    while (walker.nextNode()) {
      const element = /** @type {HTMLElement} */ (walker.currentNode);
      const context = this.#context(element, contexts);
      const boundary = context?.boundary;
      if (!boundary || context.legacy) {
        continue;
      }
      let item = boundaryItems.get(boundary);
      if (item === undefined) {
        item = this.#items.itemForNode?.(boundary) ?? null;
        boundaryItems.set(boundary, item);
      }
      // A focusable nested owner can be the item itself (its entry point).
      if (item && item !== element && this.#isEligible(element)) {
        yield { element, item };
      }
    }
  }

  /** @param {Element} element */
  itemForNode(element) {
    if (!nodeContains(this.#owner, element)) {
      return null;
    }
    const boundary = this.#context(element, new Map())?.boundary;
    return boundary ? (this.#items.itemForNode?.(boundary) ?? null) : null;
  }

  /**
   * Resolves the nearest nested owner and opt-out between `element` and the
   * owner, reusing contexts already computed for its ancestors.
   * @param {Element} element
   * @param {Map<Element, ControlContext|null>} contexts
   * @returns {ControlContext|null} `null` when top-layer or inert content
   *   separates the element from the owner.
   */
  #context(element, contexts) {
    const chain = [];
    let context = ROOT_CONTEXT;
    for (
      let ancestor = element;
      ancestor !== this.#owner;
      ancestor = getParentElement(ancestor)
    ) {
      if (!ancestor) {
        return null;
      }
      if (contexts.has(ancestor)) {
        context = contexts.get(ancestor);
        break;
      }
      chain.push(ancestor);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const ancestor = chain[i];
      if (context) {
        context = this.#extend(context, ancestor);
      }
      contexts.set(ancestor, context);
    }
    return context;
  }

  /**
   * @param {ControlContext} parent
   * @param {Element} element
   * @returns {ControlContext|null}
   */
  #extend(parent, element) {
    if (isTopLayer(element) || element.hasAttribute?.("inert")) {
      return null;
    }
    // Older observers do not share the indexed batching protocol. Preserve
    // their rovers rather than mixing control reconciliation.
    const legacy =
      parent.legacy ||
      (!!state.m?.has(element) &&
        (!state.m.get(element) || !hasIndexedObserver(element)));
    let { nestedOwner, optOut } = parent;
    const tokens = element.getAttribute?.("focusgroup");
    if (tokens != null) {
      if (tokens.split(/\s+/).includes("none")) {
        optOut = element;
      } else if (parseDefinition(element).behavior) {
        nestedOwner = element;
      }
    }
    if (
      legacy === parent.legacy &&
      nestedOwner === parent.nestedOwner &&
      optOut === parent.optOut
    ) {
      return parent;
    }
    // Nested owners associate through every enclosing owner; opt-outs stop
    // at their nearest owner.
    return { nestedOwner, optOut, legacy, boundary: nestedOwner ?? optOut };
  }

  /** @param {HTMLElement} element */
  #isEligible(element) {
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
