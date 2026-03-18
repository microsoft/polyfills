/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  BEHAVIOR_TOKENS,
  BehaviorMap,
  BehaviorToken,
  DatasetName,
} from "./constants.js";
import { nodeContains, shadowClosest } from "./shadow-utils/dom.js";
import { ShadowMutationObserver } from "./shadow-utils/mutation-observer.js";
import { ShadowTreeWalker } from "./shadow-utils/tree-walker.js";
import {
  generateUniqueId,
  getNavigationDirection,
  inferRole,
  isKeyboardFocusable,
  isSegmentor,
  supportsFocusGroup,
} from "./utils.js";

// Registry of all active focusgroup mutation observers. When any focusgroup
// writes polyfill-managed attributes (tabindex, data-fg-*, role), we flush
// *every* observer in this set so that no stale mutation records from our own
// writes survive into the next microtask — preventing infinite cross-group
// loops between nested focusgroups whose subtrees overlap.
// Add it to the `window` object in case the polyfill script being loaded
// multiple times.
globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS ??= new Set();
const observers = globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS;

function addObserver(observer) {
  observers.add(observer);
}

function flushAllObservers() {
  for (const observer of observers ?? []) {
    observer.takeRecords();
  }
}

/**
 * Polyfill the `focusgroup` HTML attribute for the given element and its
 * descendants.
 *
 * @param {HTMLElement} root - The polyfill target. Defaults to `<body>`.
 */
export function polyfill(root = document.body) {
  if (supportsFocusGroup() || !root) {
    return;
  }

  const walker = new ShadowTreeWalker(
    document,
    root,
    NodeFilter.SHOW_ELEMENT,
    (node) =>
      node.hasAttribute("focusgroup")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );

  do {
    new FocusGroup(walker.currentNode);
  } while (walker.nextNode());
}

class FocusGroup {
  /**
   * The focus group owner element.
   * @type {HTMLElement!}
   */
  #owner;

  /**
   * The unique ID for the group.
   * @type {string}
   */
  #id = generateUniqueId();

  /**
   * The focus group behavior.
   * @type {BehaviorToken!}
   */
  #behavior = BehaviorToken.NONE;

  /**
   * The focus group navigation axis limitation.
   * @type {("inline" | "block" | undefined)}
   */
  #axis = undefined;

  /**
   * Whether the focus group wraps. Defaults to `false`.
   * @type {boolean}
   */
  #wrap = false;

  /**
   * Whether the focus group remembers the previously focused element. Defaults
   * to `true`.
   * @type {boolean}
   */
  #memory = true;

  /**
   * The focus group start element.
   * @type {HTMLElement}
   */
  #start;

  /**
   * The TreeWalker to traverse all focus group items.
   * @type {ShadowTreeWalker!}
   */
  #itemWalker;

  /**
   * The memorized tab stop.
   * @type {HTMLElement|null}
   */
  #memorized = null;

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   */
  constructor(owner) {
    if (supportsFocusGroup() || !owner || !owner.hasAttribute("focusgroup")) {
      return;
    }

    this.#owner = owner;
    this.#itemWalker = new ShadowTreeWalker(
      document,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
      (node) => {
        if (
          node.hasAttribute("focusgroup") &&
          node.getAttribute(DatasetName.ITEM) !== this.#id
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.getAttribute(DatasetName.ITEM) === this.#id
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    );

    this.#updateDefinition();
    this.#decorateOwner();
    this.#decorateItems();

    // Move the walker pointer to the first tab stop element.
    while (this.#itemWalker.currentNode.tabIndex < 0) {
      // If no items in the group, move on.
      if (!this.#itemWalker.nextNode()) {
        break;
      }
    }

    const observer = new ShadowMutationObserver(
      this.#processMutations.bind(this),
    );
    observer.observe(owner, {
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
    addObserver(observer);

    this.#owner.addEventListener("keydown", this.#handleKeydown.bind(this));
    this.#owner.addEventListener("focusin", this.#handleFocusin.bind(this));
    this.#owner.addEventListener("focusout", this.#handleFocusout.bind(this));
  }

  #updateDefinition() {
    const tokens = (this.#owner?.getAttribute("focusgroup") ?? "").split(" ");

    this.#behavior = BEHAVIOR_TOKENS.includes(tokens[0])
      ? tokens[0]
      : BehaviorToken.NONE;

    this.#memory = !tokens.includes("nomemory");

    this.#wrap = BehaviorMap.get(this.#behavior)?.wrap ?? false;
    if (tokens.includes("wrap") && !this.#wrap) {
      this.#wrap = true;
    } else if (tokens.includes("nowrap") && this.#wrap) {
      this.#wrap = false;
    }

    this.#axis =
      tokens.includes("inline") && !tokens.includes("block")
        ? "inline"
        : tokens.includes("block") && !tokens.includes("inline")
          ? "block"
          : tokens.includes("inline") && tokens.includes("block")
            ? undefined
            : BehaviorMap.get(this.#behavior)?.axis;

    if (!this.#memory) {
      this.#memorized = null;
    }
  }

  #decorateOwner() {
    inferRole(this.#owner, this.#behavior, "owner");
  }

  #decorateItems() {
    if (this.#behavior === BehaviorToken.NONE) {
      this.#undecorateItems();
      return;
    }

    const walker = new ShadowTreeWalker(
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

    let firstItem = null;
    let startItem = null;
    let segment = 0;
    let shouldStartNewSegment = false;

    while (walker.nextNode()) {
      const node = walker.currentNode;

      // --- Handle segment boundaries (nested focusgroup elements) ---
      if (this.#isNestedGroupOwner(node)) {
        if (isSegmentor(node)) {
          segment++;
          shouldStartNewSegment = true;
        }
        // A focusable, non-opted-out nested focusgroup owner participates as
        // an item in this group — fall through to decoration.
        // Otherwise skip — it’s only a boundary marker.
        const isOptedOut = node.getAttribute("focusgroup").includes("none");
        if (!isKeyboardFocusable(node) || isOptedOut) {
          continue;
        }
      }

      // --- Decorate item ---
      if (!firstItem) {
        firstItem = node;
      }
      node.setAttribute(DatasetName.ITEM, this.#id);

      if (segment > 0) {
        node.setAttribute(DatasetName.SEGMENT, segment.toString());
      }

      const isSegmentStart = shouldStartNewSegment;
      if (isSegmentStart) {
        node.setAttribute(DatasetName.SEGMENT_START, "");
        shouldStartNewSegment = false;
      }

      // Role inference
      inferRole(node, this.#behavior, "child");

      // Preserve original tabindex
      node.setAttribute(
        DatasetName.AUTHOR_TABINDEX,
        node.hasAttribute("tabindex") ? node.getAttribute("tabindex") : "none",
      );

      // Determine tab stop
      if (!startItem && node.hasAttribute("focusgroupstart")) {
        startItem = node;
      } else {
        node.tabIndex = isSegmentStart ? 0 : -1;
      }
    }

    if (!startItem && firstItem) {
      startItem = firstItem;
    }

    if (this.#memorized) {
      startItem = this.#memorized;
    }

    if (startItem) {
      startItem.tabIndex = 0;
      this.#start = startItem;
    }

    flushAllObservers();
  }

  #undecorateItems() {
    const first = this.#getFirstItem();

    if (!first) {
      return;
    }

    do {
      const item = this.#itemWalker.currentNode;

      // Restore role
      inferRole(item, null, null);

      // Restore tabindex
      if (item.hasAttribute(DatasetName.AUTHOR_TABINDEX)) {
        const authorTabIndex = item.getAttribute(DatasetName.AUTHOR_TABINDEX);
        if (authorTabIndex === "none") {
          item.removeAttribute("tabindex");
        } else {
          item.setAttribute(
            "tabindex",
            item.getAttribute(DatasetName.AUTHOR_TABINDEX),
          );
        }
        item.removeAttribute(DatasetName.AUTHOR_TABINDEX);
      }

      item.removeAttribute(DatasetName.ITEM);
    } while (this.#itemWalker.nextNode());

    flushAllObservers();
  }

  #getFirstItem() {
    let first;

    do {
      first = this.#itemWalker.currentNode;
    } while (this.#itemWalker?.previousNode());

    return first;
  }

  #getLastItem() {
    let last;

    do {
      last = this.#itemWalker.currentNode;
    } while (this.#itemWalker?.nextNode());

    return last;
  }

  /** @param {KeyboardEvent!} evt */
  #handleKeydown(evt) {
    const evtTarget = evt.composedPath()[0];

    if (evt.defaultPrevented || evtTarget === this.#owner) {
      return;
    }

    const closestGroup = shadowClosest(evtTarget, "[focusgroup]");

    if (closestGroup) {
      evt.stopPropagation();
    }

    // Avoid focus group navigation if the focus is on an opted-out element.
    if (closestGroup.getAttribute("focusgroup").includes("none")) {
      return;
    }

    const current = this.#itemWalker.currentNode;
    let target;

    switch (getNavigationDirection(evt, evtTarget, this.#axis)) {
      case "start":
        target = this.#getFirstItem();
        break;
      case "end":
        target = this.#getLastItem();
        break;
      case "forward":
        target = this.#itemWalker.nextNode();
        if (!target && this.#wrap) {
          target = this.#getFirstItem();
        }
        break;
      case "backward":
        target = this.#itemWalker.previousNode();
        if (!target && this.#wrap) {
          target = this.#getLastItem();
        }
        break;
    }

    if (target && target !== current) {
      this.#setItemFocused(current, target, true);
      evt.preventDefault();
    }
  }

  /** @param {FocusEvent!} evt */
  #handleFocusin(evt) {
    const target = evt.target.shadowRoot ? evt.composedPath()[0] : evt.target;

    if (!this.#itemWalker.filter(target)) {
      return;
    }

    if (this.#memory) {
      this.#memorized = target;
    }

    if (this.#itemWalker.currentNode === target) {
      return;
    }

    if (target.tabIndex < 0) {
      this.#setItemFocused(this.#itemWalker.currentNode, target);
    }
    this.#itemWalker.currentNode = target;
  }

  /** @param {FocusEvent!} evt */
  #handleFocusout(evt) {
    if (
      (evt.relatedTarget && this.#owner.contains(evt.relatedTarget)) ||
      this.#memory ||
      !this.#start
    ) {
      return;
    }

    // Clear the memory.
    this.#start.tabIndex = 0;
    this.#itemWalker.currentNode = this.#start;
    while (this.#itemWalker.nextNode()) {
      const current = this.#itemWalker.currentNode;
      current.tabIndex = current.hasAttribute(DatasetName.SEGMENT_START)
        ? 0
        : -1;
    }

    flushAllObservers();
  }

  #isItemCandidate(node) {
    return (
      // if it’s already an item (useful when focusgroup definition changes)
      node.hasAttribute(DatasetName.ITEM) ||
      // if the element is yet to be decorated
      (isKeyboardFocusable(node) &&
        (node.assignedSlot
          ? shadowClosest(node.assignedSlot, "[focusgroup]") === this.#owner
          : shadowClosest(node.parentNode, "[focusgroup]") === this.#owner))
    );
  }

  #isNestedGroupOwner(node) {
    return node.hasAttribute("focusgroup") && node !== this.#owner;
  }

  #setItemFocused(current, target, shouldCallFocus = false) {
    target.tabIndex = 0;
    if (shouldCallFocus) {
      target.focus();
    }
    current.tabIndex =
      current.getAttribute(DatasetName.SEGMENT) ===
      target.getAttribute(DatasetName.SEGMENT)
        ? -1
        : 0;

    flushAllObservers();
  }

  // TODO: Handle mutations more granularly than redecorating all items.
  #processMutations(entries) {
    const hasDefinitionChanged = entries.find(
      (e) => e.target === this.#owner && e.attributeName === "focusgroup",
    );
    if (hasDefinitionChanged) {
      this.#updateDefinition();
      this.#decorateOwner();
    }

    // If the memorized tab stop element has been removed, clear the memory.
    if (this.#memorized) {
      const memorizedRemoved = entries.some(
        (e) =>
          e.type === "childList" &&
          Array.from(e.removedNodes).some(
            (n) => n === this.#memorized || nodeContains(n, this.#memorized),
          ),
      );
      if (memorizedRemoved) {
        this.#memorized = null;
      }
    }

    // When the author changes `tabindex` on an already-decorated item that
    // belongs to *this* focusgroup, update the stored author intent
    // (`data-fg-ati`) so the upcoming undecorate → redecorate cycle uses the
    // new value.  Ignore tabindex mutations on items owned by nested groups —
    // those are caused by the nested group's own decoration.
    for (const entry of entries) {
      if (
        entry.type === "attributes" &&
        entry.attributeName === "tabindex" &&
        entry.target.hasAttribute(DatasetName.AUTHOR_TABINDEX) &&
        entry.target.getAttribute(DatasetName.ITEM) === this.#id
      ) {
        entry.target.setAttribute(
          DatasetName.AUTHOR_TABINDEX,
          entry.target.getAttribute("tabindex") ?? "none",
        );
      }
    }

    this.#undecorateItems();
    this.#decorateItems();
  }
}
