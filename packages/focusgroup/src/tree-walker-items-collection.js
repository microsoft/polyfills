// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DatasetName } from "./constants.js";
import { FocusGroupItemsMutateEvent } from "./focusgroup-items.js";
import { observers } from "./observer-registry.js";
import {
  createMutationObserver,
  createTreeWalker,
  getClosestElement,
  IS_SHADOWLESS,
  nodeContains,
} from "./shadow-utils/index.js";
import { generateUniqueId, isKeyboardFocusable, isSegmentor } from "./utils.js";

/** @import { FocusGroupItem } from "./focusgroup-items.js" */

/**
 * The default `FocusGroupItemsCollection` implementation used by the polyfill.
 *
 * Discovers items via a shadow-aware `TreeWalker` and observes the owner
 * subtree with a `MutationObserver`. Translates raw mutation batches into
 * `FocusGroupItemsMutateEvent`s, filtering out cross-group polyfill-managed
 * tabindex writes and owner-proxy noise.
 *
 * Implements the `FocusGroupItemsCollection` interface.
 */
export class TreeWalkerItemsCollection extends EventTarget {
  /**
   * Unique id used by `FocusGroup` to tag decorated items via the
   * `data-fg-item` attribute. Used here to disambiguate items of this group
   * from items of overlapping groups (possible via shadow-DOM slotting).
   * @type {string}
   */
  id = generateUniqueId();

  /** @type {HTMLElement} */
  #owner;

  /** @type {ShadowTreeWalker} */
  #walker;

  /** @type {MutationObserver} */
  #observer;

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   */
  constructor(owner) {
    super();
    this.#owner = owner;

    this.#walker = createTreeWalker(
      document,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
      (node) => this.#filter(node),
    );

    this.#observer = createMutationObserver((records) => {
      const evt = this.#classify(records);
      if (evt) {
        this.dispatchEvent(evt);
      }
    });
    this.#observer.observe(this.#owner, {
      attributes: true,
      attributeFilter: [
        "focusgroup",
        "focusgroupstart",
        "controls",
        "contenteditable",
        "disabled",
        "href",
        "hidden",
        "tabindex",
        "type",
      ],
      childList: true,
      subtree: true,
    });
    observers.add(this.#observer);
  }

  /**
   * Releases the mutation observer and removes it from the global flush
   * registry. Called from `FocusGroup#disconnect()`; safe to call directly.
   */
  disconnect() {
    observers.delete(this.#observer);
    this.#observer?.disconnect();
    this.#owner = null;
    this.#walker = null;
    this.#observer = null;
  }

  /**
   * Flushes this collection's mutation observer by calling `takeRecords()`,
   * dropping any pending records (typically caused by polyfill-managed
   * attribute writes during decoration). Called by `FocusGroup` after writing
   * `tabindex`/`data-fg-*` to avoid re-entering `#handleItemsMutate`.
   */
  flush() {
    this.#observer?.takeRecords();
  }

  /**
   * Yields all items in the focus group in navigation (document) order.
   * Each entry's `segmentBoundary` is `true` when the item is preceded by a
   * nested focusgroup acting as a segmentor.
   *
   * @returns {Generator<FocusGroupItem>}
   */
  *items() {
    const walker = createTreeWalker(
      document,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
      (node) => {
        if (this.#isItemCandidate(node) || this.#isNestedGroupOwner(node)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    );

    let pendingSegmentBoundary = false;
    /** @type {Element | null} */
    let skipSubtreeOf = null;

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (skipSubtreeOf && nodeContains(skipSubtreeOf, node)) {
        continue;
      }
      skipSubtreeOf = null;

      if (this.#isNestedGroupOwner(node)) {
        if (isSegmentor(node, this.#owner)) {
          pendingSegmentBoundary = true;
        }
        const isOptedOut = node.getAttribute("focusgroup").includes("none");
        if (isOptedOut) {
          skipSubtreeOf = node;
          continue;
        }
        if (!isKeyboardFocusable(node, this.#owner)) {
          continue;
        }
      }

      if (pendingSegmentBoundary) {
        pendingSegmentBoundary = false;
        yield { element: node, segmentBoundary: true };
      } else {
        yield { element: node };
      }
    }
  }

  /** @returns {HTMLElement | null} The first item, or null. */
  first() {
    this.#walker.currentNode = this.#owner;
    return /** @type {HTMLElement | null} */ (this.#walker.nextNode() ?? null);
  }

  /** @returns {HTMLElement | null} The last item, or null. */
  last() {
    this.#walker.currentNode = this.#owner;
    let last = null;
    while (this.#walker.nextNode()) {
      last = this.#walker.currentNode;
    }
    return /** @type {HTMLElement | null} */ (last);
  }

  /**
   * @param {HTMLElement} current
   * @returns {HTMLElement | null}
   */
  next(current) {
    this.#walker.currentNode = current;
    return /** @type {HTMLElement | null} */ (this.#walker.nextNode() ?? null);
  }

  /**
   * @param {HTMLElement} current
   * @returns {HTMLElement | null}
   */
  previous(current) {
    this.#walker.currentNode = current;
    return /** @type {HTMLElement | null} */ (
      this.#walker.previousNode() ?? null
    );
  }

  /**
   * @param {Element} element
   * @returns {boolean} Whether `element` is currently an item of this group.
   */
  contains(element) {
    return this.#filter(element) !== NodeFilter.FILTER_REJECT;
  }

  /**
   * The persistent walker's filter — accepts elements decorated as items of
   * this items collection (matching `id`) and rejects nested groups whose
   * decoration belongs to another collection.
   *
   * @param {Element} node
   * @returns {number}
   */
  #filter(node) {
    if (
      node.hasAttribute("focusgroup") &&
      node.getAttribute(DatasetName.ITEM) !== this.id
    ) {
      return NodeFilter.FILTER_REJECT;
    }
    return node.getAttribute(DatasetName.ITEM) === this.id
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_SKIP;
  }

  /**
   * @param {Element} node
   * @returns {boolean}
   */
  #isItemCandidate(node) {
    return (
      node.hasAttribute(DatasetName.ITEM) ||
      (isKeyboardFocusable(node, this.#owner) &&
        getClosestElement(
          !IS_SHADOWLESS && node.assignedSlot
            ? node.assignedSlot
            : node.parentNode,
          "[focusgroup]",
        ) === this.#owner)
    );
  }

  /**
   * @param {Element} node
   * @returns {boolean}
   */
  #isNestedGroupOwner(node) {
    return node.hasAttribute("focusgroup") && node !== this.#owner;
  }

  /**
   * Translates a `MutationRecord` batch into a `FocusGroupItemsMutateEvent`,
   * or `null` if the batch contains nothing relevant. Filters out:
   *
   * - `tabindex` writes on items decorated by *other* focusgroups
   *   (identified by the presence of `AUTHOR_TABINDEX` and a non-matching
   *   `data-fg-item`), and
   * - `tabindex` writes on the owner element itself (caused by the paired
   *   `FocusGroup` toggling its owner-proxy tabindex).
   *
   * @param {MutationRecord[]} records
   * @returns {FocusGroupItemsMutateEvent | null}
   */
  #classify(records) {
    const relevant = records.filter(
      (e) =>
        !(
          e.type === "attributes" &&
          e.attributeName === "tabindex" &&
          ((e.target.hasAttribute(DatasetName.AUTHOR_TABINDEX) &&
            e.target.getAttribute(DatasetName.ITEM) !== this.id) ||
            e.target === this.#owner)
        ),
    );

    if (relevant.length === 0) {
      return null;
    }

    const definitionChanged = relevant.some(
      (e) => e.target === this.#owner && e.attributeName === "focusgroup",
    );

    /** @type {Node[]} */
    const removedNodes = [];
    for (const e of relevant) {
      if (e.type === "childList" && e.removedNodes.length > 0) {
        removedNodes.push(...e.removedNodes);
      }
    }

    /** @type {HTMLElement[]} */
    const authorTabindexChanges = [];
    for (const e of relevant) {
      if (
        e.type === "attributes" &&
        e.attributeName === "tabindex" &&
        e.target.hasAttribute(DatasetName.AUTHOR_TABINDEX) &&
        e.target.getAttribute(DatasetName.ITEM) === this.id
      ) {
        authorTabindexChanges.push(/** @type {HTMLElement} */ (e.target));
      }
    }

    return new FocusGroupItemsMutateEvent({
      definitionChanged,
      removedNodes,
      authorTabindexChanges,
    });
  }
}
