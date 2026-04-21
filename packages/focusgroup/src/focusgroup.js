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
  getParentElement,
  nodeContains,
} from "./shadow-utils/index.js";
import {
  generateUniqueId,
  getNavigationDirection,
  inferRole,
  supportsFocusGroup,
} from "./utils.js";

/**
 * @import {
 *   FocusGroupItemCollection,
 *   FocusGroupUpdateInfo,
 * } from "./focusgroup-items.js"
 */

export class FocusGroup {
  /**
   * The focus group owner element.
   * @type {HTMLElement!}
   */
  #owner;

  /**
   * The items collection — exposes the focus group's items and answers
   * queries about them. Reconciliation is triggered externally via
   * `FocusGroup#update()`.
   * @type {FocusGroupItemCollection}
   */
  #items;

  /**
   * The id used to tag decorated items via the `data-fg-item` attribute.
   * Reads `items.id` when the items collection provides one (so the items'
   * own filtering matches what we write); otherwise generates a fresh id.
   * @type {string}
   */
  #id;

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
   * Whether the focus group remembers the previously focused element.
   * Defaults to `true`.
   * @type {boolean}
   */
  #memory = true;

  /**
   * The focus group start element (initial tab stop after decoration).
   * @type {HTMLElement}
   */
  #start;

  /**
   * The currently active item — replaces the previous TreeWalker pointer.
   * Updated by focusin / keyboard navigation handlers and after
   * (un)decoration.
   * @type {HTMLElement}
   */
  #activeItem;

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
   * Set of elements currently decorated as items by this group, used to
   * undecorate them later even if they no longer qualify as item candidates
   * (e.g. became `focusgroup="none"` or were hidden).
   * @type {Set<HTMLElement>}
   */
  #decorated = new Set();

  /**
   * The abort controller for when `disconnect()` is called.
   * @type {AbortController}
   */
  #abort = new AbortController();

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   * @param {FocusGroupItemCollection} items - The items collection providing
   *     item discovery and queries.
   */
  constructor(owner, items) {
    if (supportsFocusGroup() || !owner || !owner.hasAttribute("focusgroup")) {
      return;
    }

    this.#owner = owner;
    this.#items = items;
    this.#id = items.id ?? generateUniqueId();

    this.#updateDefinition();
    this.#decorateOwner();
    this.#decorateItems();

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
   * Tears down the focus group: disables the owner proxy, removes all event
   * listeners (via the abort signal), then disconnects the items collection
   * if it supports it.
   *
   * Ordering matters: owner-proxy teardown can trigger `flushAllObservers()`,
   * which expects the items' observer to still be in the global registry.
   * The items' own `disconnect()` is therefore called last.
   *
   * NOTE: This method does not undecorate the elements. Call it only after
   * the focusgroup owner has been removed from the DOM.
   */
  disconnect() {
    this.#disableOwnerProxy();
    this.#abort.abort();
    this.#items?.disconnect?.();
    this.#owner = null;
    this.#start = null;
    this.#activeItem = null;
    this.#memorized = null;
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

    let firstItem = null;
    let startItem = null;
    let segment = 0;

    for (const entry of this.#items.items()) {
      const node = entry.element;

      if (entry.segmentBoundary) {
        segment++;
      }

      if (!firstItem) {
        firstItem = node;
      }
      node.setAttribute(DatasetName.ITEM, this.#id);
      this.#decorated.add(node);

      if (segment > 0) {
        node.setAttribute(DatasetName.SEGMENT, segment.toString());
      }

      if (entry.segmentBoundary) {
        node.setAttribute(DatasetName.SEGMENT_START, "");
      }

      inferRole(node, this.#behavior, "child");

      node.setAttribute(
        DatasetName.AUTHOR_TABINDEX,
        node.hasAttribute("tabindex") ? node.getAttribute("tabindex") : "none",
      );

      if (!startItem && node.hasAttribute("focusgroupstart")) {
        startItem = node;
      } else {
        node.tabIndex = entry.segmentBoundary ? 0 : -1;
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
        // item in document order as the tab stop, but don't update
        // `#memorized` — memory should only be set by actual focus events.
        startItem = firstItem || startItem;
        this.#memorized = null;
      }
    }

    if (startItem) {
      startItem.tabIndex = 0;
      this.#start = startItem;
      this.#activeItem = startItem;
      this.#disableOwnerProxy();
      this.#enableOwnerProxy(startItem);
    }

    this.#items.flush?.();
  }

  #undecorateItems() {
    this.#disableOwnerProxy();

    let any = false;
    for (const element of this.#decorated) {
      // Skip if another focusgroup has claimed this element since we
      // decorated it (its `data-fg-item` no longer matches our id). The
      // claiming group will undecorate it when appropriate.
      if (element.getAttribute(DatasetName.ITEM) !== this.#id) {
        continue;
      }
      any = true;

      // Restore role
      inferRole(element, null, null);

      // Restore tabindex
      const authorTabIndex = element.getAttribute(DatasetName.AUTHOR_TABINDEX);
      if (authorTabIndex) {
        if (authorTabIndex === "none") {
          element.removeAttribute("tabindex");
        } else {
          element.setAttribute("tabindex", authorTabIndex);
        }
        element.removeAttribute(DatasetName.AUTHOR_TABINDEX);
      }

      element.removeAttribute(DatasetName.ITEM);
      element.removeAttribute(DatasetName.SEGMENT);
      element.removeAttribute(DatasetName.SEGMENT_START);
    }
    this.#decorated.clear();

    if (any) {
      this.#items.flush?.();
    }
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

    const current = this.#activeItem;
    if (!current) {
      return;
    }
    let target;

    switch (getNavigationDirection(evt, evtTarget, this.#axis)) {
      case "start":
        target = this.#items.first();
        break;
      case "end":
        target = this.#items.last();
        break;
      case "forward":
        target = this.#items.next(current);
        if (!target && this.#wrap) {
          target = this.#items.first();
        }
        break;
      case "backward":
        target = this.#items.previous(current);
        if (!target && this.#wrap) {
          target = this.#items.last();
        }
        break;
    }

    if (target && target !== current) {
      this.#setItemFocused(current, target, true);
      this.#activeItem = target;
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

    if (this.#itemWalker.filter(target) === NodeFilter.FILTER_REJECT) {
      return;
    }

    // Once focus is inside the group, disable the owner proxy so it doesn't
    // create an extra Tab stop when the user Shift+Tabs out.
    if (this.#ownerIsProxy) {
      this.#disableOwnerProxy();
      flushAllObservers();
    }

    this.#memorized = target;

    if (this.#activeItem === target) {
      return;
    }

    if (target.tabIndex < 0 && this.#activeItem) {
      this.#setItemFocused(this.#activeItem, target);
    }
    this.#activeItem = target;
  }

  /** @param {FocusEvent} evt */
  #handleFocusout(evt) {
    const focusLeavingGroup =
      !evt.relatedTarget || !nodeContains(this.#owner, evt.relatedTarget);

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

    // Clear the memory and reset tab stops, but make sure the
    // `focusgroupstart` element, if any, is considered as the new starting
    // element (it's possible that the author moved the `focusgroupstart`
    // element and the polyfill should respect that).
    this.#memorized = null;
    let firstItem = null;
    let startItem = null;
    for (const { element } of this.#items.items()) {
      if (!firstItem) {
        firstItem = element;
      }
      if (!startItem && element.hasAttribute("focusgroupstart")) {
        startItem = element;
      }
      element.tabIndex = element.hasAttribute(DatasetName.SEGMENT_START)
        ? 0
        : -1;
    }

    this.#start = startItem || firstItem;
    if (this.#start) {
      this.#start.tabIndex = 0;
    }
    this.#activeItem = this.#start;

    if (focusLeavingGroup && this.#start) {
      this.#enableOwnerProxy(this.#start);
    }

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
        getClosestElement(getParentElement(node), "[focusgroup]") ===
          this.#owner)
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
    const rootNode = (tabStop.assignedSlot ?? tabStop).getRootNode();
    const hasFocusableHost =
      rootNode instanceof ShadowRoot &&
      rootNode.host.hasAttribute(DatasetName.AUTHOR_TABINDEX);

    if (this.#ownerIsProxy || !hasFocusableHost) {
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
    this.#items.flush?.();
  }

  /**
   * Transfers the focusgroup's active tab stop from one item to another.
   * Sets the target's `tabindex` to `0` and optionally calls `focus()` on it.
   * The previous item's `tabindex` is set to `-1` unless it belongs to a
   * different segment (in which case it remains `0` as a segment tab stop).
   * Also disables the owner proxy.
   * @param {HTMLElement} current - The currently focused item.
   * @param {HTMLElement} target - The item to receive focus.
   * @param {boolean} [shouldCallFocus=false] - Whether to programmatically
   *     call `focus()` on the target element.
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
    // disabled (it was disabled in #handleFocusin). Just clear in case any
    // lingered.
    this.#disableOwnerProxy();

    flushAllObservers();
  }

  /**
   * Reconciles decoration state in response to relevant changes. Call this
   * whenever the focus group should refresh — e.g. items were added or
   * removed, the owner's `focusgroup` attribute changed, or an author set
   * `tabindex` on a decorated item.
   *
   * The polyfill's default `TreeWalkerItemCollection` calls this from a
   * `MutationObserver`. App-supplied collections (or app code that knows
   * when its model changed) can call it directly.
   *
   * @param {FocusGroupUpdateInfo} [info]
   */
  update(info = {}) {
    if (!this.#owner) {
      return;
    }

    if (info.definitionChanged) {
      this.#updateDefinition();
      this.#decorateOwner();
    }

    if (
      this.#memorized &&
      info.removedNodes?.some(
        (n) => n === this.#memorized || nodeContains(n, this.#memorized),
      )
    ) {
      this.#memorized = null;
    }

    if (info.authorTabindexChanges) {
      for (const el of info.authorTabindexChanges) {
        el.setAttribute(
          DatasetName.AUTHOR_TABINDEX,
          el.getAttribute("tabindex") ?? "none",
        );
      }
    }

    this.#undecorateItems();
    this.#decorateItems();
  }
}
