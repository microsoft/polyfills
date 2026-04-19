// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  BEHAVIOR_TOKENS,
  BehaviorMap,
  BehaviorToken,
  DatasetName,
} from "./constants.js";
import {
  createMutationObserver,
  createTreeWalker,
  getClosestElement,
  IS_SHADOWLESS,
  nodeContains,
} from "./shadow-utils/index.js";
import {
  generateUniqueId,
  getNavigationDirection,
  inferRole,
  isKeyboardFocusable,
  isSegmentor,
  supportsFocusGroup,
} from "./utils.js";

// Registry of all active focusgroup mutation observers. When any focusgroup
// writes polyfill-managed attributes (tabindex) during focus event handling,
// we flush *every* observer in this set so that no stale mutation records from
// cross-group writes survive into the next microtask — preventing unintended
// re-decoration from ancestor/descendant focusgroups whose subtrees overlap.
// Stored on `globalThis` in case the polyfill script is loaded multiple times.
globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS ??= new Set();
/** @type {Set<MutationObserver>} */
const observers = globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS;

/**
 * Registers a MutationObserver in the global observer registry so it can be
 * flushed when any focusgroup writes polyfill-managed attributes.
 * @param {MutationObserver} observer - The observer to register.
 */
function addObserver(observer) {
  observers.add(observer);
}

/**
 * Flushes all globally registered focusgroup MutationObservers by calling
 * `takeRecords()` on each, discarding any pending mutation records that were
 * caused by polyfill-managed attribute writes. This prevents infinite
 * cross-group loops between nested focusgroups whose subtrees overlap.
 */
function flushAllObservers() {
  for (const observer of observers ?? []) {
    observer.takeRecords();
  }
}

export class FocusGroup {
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
   * Whether the owner currently has `tabindex=0` set as a Tab-entry proxy so
   * sequential focus navigation can reach a tab stop inside a shadow root.
   * @type {boolean}
   */
  #ownerIsProxy = false;

  /**
   * The owner's original `tabindex` attribute value (or `null` if it had no
   * `tabindex`), saved before the polyfill sets `tabindex=0` for proxy duty.
   * @type {string|null}
   */
  #ownerTabindexBeforeProxy = null;

  /**
   * The mutation observer.
   * @type {MutationObserver}
   */
  #observer;

  /**
   * The abort controller for when the `recycle()` is called.
   * @type {AbortController}
   */
  #abort = new AbortController();

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   */
  constructor(owner) {
    if (supportsFocusGroup() || !owner || !owner.hasAttribute("focusgroup")) {
      return;
    }

    this.#owner = owner;
    this.#itemWalker = createTreeWalker(
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

    this.#observer = createMutationObserver(this.#processMutations.bind(this));
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
    addObserver(this.#observer);

    this.#owner.addEventListener("keydown", this.#handleKeydown.bind(this), {
      signal: this.#abort.signal,
    });
    this.#owner.addEventListener("focusin", this.#handleFocusin.bind(this), {
      signal: this.#abort.signal,
    });
    this.#owner.addEventListener("focusout", this.#handleFocusout.bind(this), {
      signal: this.#abort.signal,
    });
  }

  /**
   * Recycles the focusgroup and release observers for garbage collection.
   * NOTE: This method does not undecorate the elements, it should be called
   * after the focusgroup owner being removed from DOM.
   */
  recycle() {
    observers.delete(this.#observer);
    this.#observer?.disconnect();
    this.#disableOwnerProxy();
    this.#owner = null;
    this.#start = null;
    this.#itemWalker = null;
    this.#memorized = null;
    this.#abort.abort();
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

    const hasInline = tokens.includes("inline");
    const hasBlock = tokens.includes("block");
    this.#axis =
      hasInline && !hasBlock
        ? "inline"
        : hasBlock && !hasInline
          ? "block"
          : hasInline && hasBlock
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

    let firstItem = null;
    let startItem = null;
    let segment = 0;
    let shouldStartNewSegment = false;

    while (walker.nextNode()) {
      const node = walker.currentNode;

      // --- Handle segment boundaries (nested focusgroup elements) ---
      if (this.#isNestedGroupOwner(node)) {
        if (isSegmentor(node, this.#owner)) {
          segment++;
          shouldStartNewSegment = true;
        }
        // A focusable, non-opted-out nested focusgroup owner participates as
        // an item in this group — fall through to decoration.
        // Otherwise skip — it’s only a boundary marker.
        const isOptedOut = node.getAttribute("focusgroup").includes("none");
        if (!isKeyboardFocusable(node, this.#owner) || isOptedOut) {
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

    if (!this.#memorized?.isConnected) {
      this.#memorized = null;
    }

    if (this.#memorized) {
      // Verify the memorized element is still a valid item in this group.
      // It may have become ineligible (disabled, hidden, moved to a nested
      // group, etc.) since it was last focused.
      if (this.#memorized.getAttribute(DatasetName.ITEM) === this.#id) {
        startItem = this.#memorized;
      } else {
        // The memorized element is no longer a valid item. Pick the closest
        // item in document order as the tab stop, but don't update #memorized
        // — memory should only be set by actual focus events.
        startItem = firstItem || startItem;
        this.#memorized = null;
      }
    }

    if (startItem) {
      startItem.tabIndex = 0;
      this.#start = startItem;
      this.#disableOwnerProxy();
      this.#enableOwnerProxy(startItem);
      this.#itemWalker.currentNode = startItem;
    }

    this.#flushObserver();
  }

  #undecorateItems() {
    this.#disableOwnerProxy();

    const first = this.#firstItem();

    if (!first) {
      return;
    }

    do {
      const item = this.#itemWalker.currentNode;

      // Restore role
      inferRole(item, null, null);

      // Restore tabindex
      const authorTabIndex = item.getAttribute(DatasetName.AUTHOR_TABINDEX);
      if (authorTabIndex) {
        if (authorTabIndex === "none") {
          item.removeAttribute("tabindex");
        } else {
          item.setAttribute("tabindex", authorTabIndex);
        }
        item.removeAttribute(DatasetName.AUTHOR_TABINDEX);
      }

      item.removeAttribute(DatasetName.ITEM);
    } while (this.#itemWalker.nextNode());

    this.#flushObserver();
  }

  /** @returns {HTMLElement} The first item element. */
  #firstItem() {
    while (this.#itemWalker.previousNode()) {}
    return this.#itemWalker.currentNode;
  }

  /** @returns {HTMLElement} The last item element. */
  #lastItem() {
    while (this.#itemWalker.nextNode()) {}
    return this.#itemWalker.currentNode;
  }

  /** @param {KeyboardEvent} evt */
  #handleKeydown(evt) {
    const evtTarget = evt.composedPath()[0];

    if (evt.defaultPrevented || evtTarget === this.#owner) {
      return;
    }

    const closestGroup = getClosestElement(evtTarget, "[focusgroup]");

    if (closestGroup) {
      evt.stopPropagation();
    }

    // Avoid focus group navigation if the focus is on an opted-out element.
    if (closestGroup?.getAttribute("focusgroup").includes("none")) {
      return;
    }

    const current = this.#itemWalker.currentNode;
    let target;

    switch (getNavigationDirection(evt, evtTarget, this.#axis)) {
      case "start":
        target = this.#firstItem();
        break;
      case "end":
        target = this.#lastItem();
        break;
      case "forward":
        target = this.#itemWalker.nextNode();
        if (!target && this.#wrap) {
          target = this.#firstItem();
        }
        break;
      case "backward":
        target = this.#itemWalker.previousNode();
        if (!target && this.#wrap) {
          target = this.#lastItem();
        }
        break;
    }

    if (target && target !== current) {
      this.#setItemFocused(current, target, true);
      evt.preventDefault();
    }
  }

  /** @param {FocusEvent} evt */
  #handleFocusin(evt) {
    const target = evt.target.shadowRoot ? evt.composedPath()[0] : evt.target;

    const focusEnteringGroup =
      !evt.relatedTarget || !nodeContains(this.#owner, evt.relatedTarget);

    // When the owner is acting as a Tab-entry proxy, redirect focus to the
    // actual tab stop and disable the proxy so it doesn't create an extra stop.
    if (target === this.#owner && this.#ownerIsProxy && focusEnteringGroup) {
      const tabStop = this.#memorized || this.#start;
      this.#disableOwnerProxy();
      flushAllObservers();
      if (tabStop) {
        tabStop.focus();
      }
      evt.stopPropagation();
      return;
    }

    if (!this.#itemWalker.filter(target)) {
      return;
    }

    // Once focus is inside the group, disable the owner proxy so it doesn't
    // create an extra Tab stop when the user Shift+Tabs out.
    if (this.#ownerIsProxy) {
      this.#disableOwnerProxy();
      flushAllObservers();
    }

    this.#memorized = target;

    if (this.#itemWalker.currentNode === target) {
      return;
    }

    if (target.tabIndex < 0) {
      this.#setItemFocused(this.#itemWalker.currentNode, target);
    }
    this.#itemWalker.currentNode = target;
  }

  /** @param {FocusEvent} evt */
  #handleFocusout(evt) {
    const focusLeavingGroup =
      !evt.relatedTarget || !this.#owner.contains(evt.relatedTarget);

    // When focus leaves the group, re-enable the owner as a Tab-entry proxy
    // so Tab can re-enter the group to reach the tab stop.
    if (focusLeavingGroup) {
      const tabStop = this.#memory
        ? this.#memorized || this.#start
        : this.#start;
      if (tabStop) {
        this.#enableOwnerProxy(tabStop);
        flushAllObservers();
      }
    }

    if (
      (evt.relatedTarget && this.#owner.contains(evt.relatedTarget)) ||
      this.#memory ||
      !this.#start
    ) {
      return;
    }

    // Clear the memory and reset tab stops, but make sure the `focusgroupstart`
    // element, if any, is considered as the new starting element (it’s possible
    // that the author moved the `focusgroupstart` element and the polyfill
    // should respect that.
    this.#memorized = null;
    const first = this.#firstItem();
    let startItem = null;
    do {
      const current = this.#itemWalker.currentNode;
      if (!startItem && current.hasAttribute("focusgroupstart")) {
        startItem = current;
      }
      current.tabIndex = current.hasAttribute(DatasetName.SEGMENT_START)
        ? 0
        : -1;
    } while (this.#itemWalker.nextNode());

    this.#start = startItem || first;
    this.#start.tabIndex = 0;
    this.#itemWalker.currentNode = this.#start;

    if (focusLeavingGroup) {
      this.#enableOwnerProxy(this.#start);
    }

    // Proxy hosts for the reset tab stop are already set above.

    flushAllObservers();
  }

  /**
   * @param {HTMLElement} node
   * @returns {boolean}
   */
  #isItemCandidate(node) {
    return (
      // if it’s already an item (useful when focusgroup definition changes)
      node.hasAttribute(DatasetName.ITEM) ||
      // if the element is yet to be decorated
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
   * @param {HTMLElement} node
   * @returns {boolean}
   */
  #isNestedGroupOwner(node) {
    return node.hasAttribute("focusgroup") && node !== this.#owner;
  }

  /**
   * If the tab stop is inside a shadow DOM, sets `tabindex=0` on the
   * focusgroup owner so the browser's Tab navigation can land on it, at
   * which point `#handleFocusin` will redirect focus to the real tab stop.
   * @param {HTMLElement} tabStop - The actual focusable tab stop element.
   */
  #enableOwnerProxy(tabStop) {
    if (
      this.#ownerIsProxy ||
      (!(tabStop.getRootNode() instanceof ShadowRoot) && !tabStop.assignedSlot)
    ) {
      return;
    }
    this.#ownerTabindexBeforeProxy = this.#owner.hasAttribute("tabindex")
      ? this.#owner.getAttribute("tabindex")
      : null;
    this.#owner.tabIndex = 0;
    this.#ownerIsProxy = true;
    flushAllObservers();
  }

  /**
   * Restores the owner's original `tabindex` (or removes it if it had none),
   * undoing `#enableOwnerProxy`.
   */
  #disableOwnerProxy() {
    if (!this.#ownerIsProxy) {
      return;
    }
    if (this.#ownerTabindexBeforeProxy !== null) {
      this.#owner.setAttribute("tabindex", this.#ownerTabindexBeforeProxy);
    } else {
      this.#owner.removeAttribute("tabindex");
    }
    this.#ownerIsProxy = false;
    this.#ownerTabindexBeforeProxy = null;
    this.#flushObserver();
  }

  /**
   * Flushes this group's own MutationObserver by calling `takeRecords()`,
   * discarding any pending mutation records that were caused by polyfill-managed
   * attribute writes (primarily `tabindex`). This prevents this group from
   * re-processing its own decoration writes as if they were author-initiated
   * changes. Unlike the previous global flush approach, this only discards
   * records for *this* observer, leaving other groups' legitimate records intact.
   */
  #flushObserver() {
    this.#observer?.takeRecords();
  }

  /**
   * Transfers the focusgroup's active tab stop from one item to another.
   * Sets the target's `tabindex` to `0` and optionally calls `focus()` on it.
   * The previous item's `tabindex` is set to `-1` unless it belongs to a
   * different segment (in which case it remains `0` as a segment tab stop).
   * Also disables the owner proxy.
   * @param {HTMLElement} current - The currently focused item.
   * @param {HTMLElement} target - The item to receive focus.
   * @param {boolean} [shouldCallFocus=false] - Whether to programmatically call
   *     `focus()` on the target element.
   */
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

    // Focus is moving within the group, so the owner proxy should stay
    // disabled (it was disabled in #handleFocusin). Just clear in case any lingered.
    this.#disableOwnerProxy();

    flushAllObservers();
  }

  /**
   * Processes DOM mutation records observed on the owner's subtree. Handles
   * changes to the `focusgroup` attribute definition, removal of the memorized
   * tab stop, and author `tabindex` updates on decorated items. After
   * processing, fully undecorates and redecorates all items to reconcile state.
   * @param {MutationRecord[]} entries - The list of mutation records to process.
   */
  // TODO: Handle mutations more granularly than redecorating all items.
  #processMutations(entries) {
    // When the polyfill writes `tabindex` during decoration or focus management,
    // observers on ancestor/descendant focusgroups will also receive those
    // mutation records (because of `subtree: true`). Filter those out to avoid
    // infinite re-decoration loops. A `tabindex` mutation on an element that
    // belongs to another focusgroup (i.e. has `AUTHOR_TABINDEX` set but
    // `DatasetName.ITEM` !== this group's ID) is polyfill-managed by that other
    // group. If *every* entry in the batch is such a cross-group tabindex write,
    // there's nothing for us to do — skip entirely.
    const relevantEntries = entries.filter(
      (e) =>
        !(
          e.type === "attributes" &&
          e.attributeName === "tabindex" &&
          // Ignore cross-group tabindex writes (items of other focusgroups).
          ((e.target.hasAttribute(DatasetName.AUTHOR_TABINDEX) &&
            e.target.getAttribute(DatasetName.ITEM) !== this.#id) ||
            // Ignore owner tabindex writes caused by proxy enable/disable.
            e.target === this.#owner)
        ),
    );

    if (relevantEntries.length === 0) {
      return;
    }

    const hasDefinitionChanged = entries.some(
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
