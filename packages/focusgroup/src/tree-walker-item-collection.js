// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BehaviorToken, DatasetName } from "./constants.js";
import { observers } from "./observer-registry.js";
import {
  createMutationObserver,
  createTreeWalker,
  getClosestElement,
  getParentElement,
  nodeContains,
} from "./shadow-utils/index.js";
import {
  generateUniqueId,
  isKeyboardFocusable,
  isSegmentor,
  parseDefinition,
} from "./utils.js";

/**
 * @import {
 *   FocusGroupItem,
 *   FocusGroupUpdateInfo,
 * } from "./focusgroup-items.js"
 * @import { FocusGroup } from "./focusgroup.js"
 */

/**
 * The default `FocusGroupItemCollection` implementation used by the polyfill.
 *
 * Discovers items via a shadow-aware `TreeWalker`. After construction, call
 * `observe(focusGroup)` to start a `MutationObserver` on the owner subtree;
 * mutation batches are translated into `FocusGroupUpdateInfo` payloads
 * passed to `focusGroup.update()`, filtering out cross-group polyfill-managed
 * tabindex writes and owner-proxy noise.
 */
export class TreeWalkerItemCollection {
  /**
   * Unique id used by `FocusGroup` to tag decorated items via the
   * `data-fg-item` attribute. Used here to disambiguate items of this group
   * from items of overlapping groups (possible via shadow-DOM slotting).
   * @type {string}
   */
  id = generateUniqueId();

  /**
   * First descendant with the `focusgroupstart` attribute (shadow-aware),
   * or the first item as fallback, or `null` if none exist. `FocusGroup`
   * reads this to choose the initial tab stop after decoration.
   * @returns {HTMLElement | null}
   */
  get start() {
    if (!this.#owner) {
      return null;
    }
    let first = null;
    for (const { element } of this.items()) {
      if (element.hasAttribute("focusgroupstart")) {
        return element;
      }
      first ??= element;
    }
    return first;
  }

  /** @type {HTMLElement} */
  #owner;

  /** @type {ShadowTreeWalker} */
  #walker;

  /** @type {MutationObserver | null} */
  #observer = null;

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   */
  constructor(owner) {
    this.#owner = owner;

    this.#walker = createTreeWalker(
      document,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
      (node) => this.#filter(node),
    );
  }

  /**
   * Starts observing the owner subtree for mutations. Each relevant batch
   * is delivered to `focusGroup.update(info)`. Call this once, after the
   * paired `FocusGroup` has been constructed.
   *
   * @param {FocusGroup} focusGroup
   */
  observe(focusGroup) {
    this.#observer = createMutationObserver((records) => {
      const info = this.#classify(records);
      if (info) {
        focusGroup.update(info);
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
   * Discovers items in the owner subtree and writes the marker attributes
   * (`data-fg-item`, `data-fg-seg`, `data-fg-segs`). Heavy walk — uses the
   * full candidacy filter (`isKeyboardFocusable` + ownership) and respects
   * nested-focusgroup opt-out subtrees and segmentor boundaries.
   *
   * After this call, `items()` will yield the marked items, and
   * `isItem()` / the persistent walker (used by `first/last/next/previous`)
   * will recognize them.
   */
  decorate() {
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
    let segment = 0;
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
        const isOptedOut = node
          .getAttribute("focusgroup")
          .includes(BehaviorToken.NONE);
        if (isOptedOut) {
          skipSubtreeOf = node;
          continue;
        }
        if (!isKeyboardFocusable(node, this.#owner)) {
          continue;
        }
      }

      node.setAttribute(DatasetName.ITEM, this.id);
      if (pendingSegmentBoundary) {
        segment++;
        node.setAttribute(DatasetName.SEGMENT, String(segment));
        node.setAttribute(DatasetName.SEGMENT_START, "");
        pendingSegmentBoundary = false;
      } else if (segment > 0) {
        node.setAttribute(DatasetName.SEGMENT, String(segment));
      }
    }
  }

  /**
   * Yields all items previously marked by `decorate()` in document order.
   * Light walk — iterates only `data-fg-item="${id}"` nodes via the
   * persistent walker (which rejects foreign-focusgroup subtrees). Reads
   * `segmentBoundary` from the DOM marker.
   *
   * @returns {Generator<FocusGroupItem>}
   */
  *items() {
    this.#walker.currentNode = this.#owner;
    while (this.#walker.nextNode()) {
      const node = /** @type {HTMLElement} */ (this.#walker.currentNode);
      yield {
        element: node,
        segmentBoundary: node.hasAttribute(DatasetName.SEGMENT_START),
      };
    }
  }

  /**
   * Clears all marker attributes (`data-fg-item`, `data-fg-seg`,
   * `data-fg-segs`) written by `decorate()`. Light walk over marked nodes.
   */
  undecorate() {
    // Snapshot first — clearing markers mid-walk would invalidate the
    // walker's filter and skip subsequent nodes.
    const marked = [];
    this.#walker.currentNode = this.#owner;
    while (this.#walker.nextNode()) {
      marked.push(/** @type {HTMLElement} */ (this.#walker.currentNode));
    }
    for (const node of marked) {
      node.removeAttribute(DatasetName.ITEM);
      node.removeAttribute(DatasetName.SEGMENT);
      node.removeAttribute(DatasetName.SEGMENT_START);
    }
  }

  /**
   * Whether `el` is the first item of a non-initial segment (i.e. the item
   * that immediately follows a segmentor in document order).
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  isSegmentStart(el) {
    return el.hasAttribute(DatasetName.SEGMENT_START);
  }

  /**
   * Whether `a` and `b` belong to the same segment.
   * @param {HTMLElement} a
   * @param {HTMLElement} b
   * @returns {boolean}
   */
  sameSegment(a, b) {
    return (
      a.getAttribute(DatasetName.SEGMENT) ===
      b.getAttribute(DatasetName.SEGMENT)
    );
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
   * Strict membership: is `element` currently a decorated item of *this*
   * collection?
   * @param {Element} element
   * @returns {boolean}
   */
  isItem(element) {
    return element.getAttribute(DatasetName.ITEM) === this.id;
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
      isKeyboardFocusable(node, this.#owner) &&
      getClosestElement(getParentElement(node), "[focusgroup]") === this.#owner
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
   * Translates a `MutationRecord` batch into a `FocusGroupUpdateInfo`,
   * or `null` if the batch contains nothing relevant. Filters out:
   *
   * - `tabindex` writes on items decorated by *other* focusgroups
   *   (identified by the presence of `AUTHOR_TABINDEX` and a non-matching
   *   `data-fg-item`), and
   * - `tabindex` writes on the owner element itself (caused by the paired
   *   `FocusGroup` toggling its owner-proxy tabindex).
   *
   * @param {MutationRecord[]} records
   * @returns {FocusGroupUpdateInfo | null}
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

    return {
      definition: definitionChanged ? parseDefinition(this.#owner) : undefined,
      removedNodes,
      authorTabindexChanges,
    };
  }
}
