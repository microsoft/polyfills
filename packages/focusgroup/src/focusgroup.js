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
  supportsFocusGroup,
} from "./utils.js";

/**
 * @import {
 *   FocusGroupItemCollection,
 *   FocusGroupOptions,
 *   FocusGroupUpdateInfo,
 * } from "./focusgroup-items.js"
 * @import {FocusGroupDefinition} from "./utils.js"
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
   * The current item — the most recently focused item within the group.
   * Serves as the keyboard-navigation cursor while focus is inside, and (in
   * memory mode) as the tab stop to restore on re-entry. Updated by
   * `#handleFocusin`, plus directly by `#handleKeydown` for shadow-internal
   * navigation (where focus events don't cross the shadow boundary).
   * Cleared in nomemory mode on focusout and when validation fails after
   * re-decoration.
   * @type {HTMLElement|null}
   */
  #current = null;

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
   * The abort controller for when `disconnect()` is called.
   * @type {AbortController}
   */
  #abort = new AbortController();

  /**
   * Optional owner-decoration hook injected via `options.decorateOwner`.
   * Called with `(owner, behavior)` on decoration and `(owner, null)` on
   * undecoration. When absent, no owner decoration happens.
   * @type {((element: HTMLElement, behavior: BehaviorToken|null) => void) | undefined}
   */
  #decorateOwner;

  /**
   * Optional item-decoration hook injected via `options.decorateItem`.
   * Called with `(item, behavior)` on decoration and `(item, null)` on
   * undecoration. When absent, no item decoration happens.
   * @type {((element: HTMLElement, behavior: BehaviorToken|null) => void) | undefined}
   */
  #decorateItem;

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   * @param {FocusGroupItemCollection} items - The items collection providing
   *     item discovery and queries.
   * @param {FocusGroupOptions} [options]
   */
  constructor(owner, items, options = {}) {
    if (supportsFocusGroup() || !owner) {
      return;
    }

    this.#owner = owner;
    this.#items = items;
    this.#decorateOwner = options.decorateOwner;
    this.#decorateItem = options.decorateItem;

    this.#updateDefinition(options.definition);
    this.#decorateOwner?.(this.#owner, this.#behavior);
    this.#decorateItems();

    const opts = { signal: this.#abort.signal };
    this.#owner.addEventListener(
      "keydown",
      this.#handleKeydown.bind(this),
      opts,
    );
    this.#owner.addEventListener(
      "focusin",
      this.#handleFocusin.bind(this),
      opts,
    );
    this.#owner.addEventListener(
      "focusout",
      this.#handleFocusout.bind(this),
      opts,
    );
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
    this.#disableFocusabilityProxy();
    this.#abort.abort();
    this.#items?.disconnect?.();
    this.#owner = null;
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

    if (info.definition !== undefined) {
      this.#updateDefinition(info.definition);
      this.#decorateOwner?.(this.#owner, this.#behavior);
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

  /** @param {FocusGroupDefinition} [def] */
  #updateDefinition(def) {
    this.#behavior = def?.behavior ?? BehaviorToken.NONE;
    this.#wrap = def?.wrap ?? false;
    this.#axis = def?.axis;
    this.#memory = def?.memory ?? true;
    if (!this.#memory) {
      this.#current = null;
    }
  }

  #decorateItems() {
    if (this.#behavior === BehaviorToken.NONE) {
      this.#undecorateItems();
      return;
    }

    this.#items.decorate?.();

    for (const { element, segmentBoundary } of this.#items.items()) {
      // Set role
      this.#decorateItem?.(element, this.#behavior);

      // Set tabindex
      element.setAttribute(
        DatasetName.AUTHOR_TABINDEX,
        element.getAttribute("tabindex") ?? "none",
      );
      element.tabIndex = segmentBoundary ? 0 : -1;
    }

    if (
      !this.#current?.isConnected ||
      !(
        this.#items.isItem?.(this.#current) ??
        this.#items.contains(this.#current)
      )
    ) {
      this.#current = null;
    }

    const startItem =
      this.#current ?? this.#items.start ?? this.#items.first?.() ?? null;

    if (startItem) {
      startItem.tabIndex = 0;
      this.#start = startItem;
      this.#disableFocusabilityProxy();
      this.#enableFocusabilityProxy(startItem);
    }

    this.#items.flush?.();
  }

  #undecorateItems() {
    this.#disableFocusabilityProxy();

    let undecorated = false;

    for (const { element } of this.#items.items()) {
      undecorated = true;

      // Restore role
      this.#decorateItem?.(element, null);

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
    }

    this.#items.undecorate?.();

    if (undecorated) {
      this.#items.flush?.();
    }
  }

  /** @param {KeyboardEvent} evt */
  #handleKeydown(evt) {
    const current = evt.composedPath()[0];

    if (evt.defaultPrevented || current === this.#owner) {
      return;
    }

    // Only handle events targeted at our own items. The collection's
    // candidacy filter already excludes opted-out subtrees and items owned
    // by nested focusgroups, so this guard subsumes both the legacy
    // closest-`[focusgroup]` opt-out check and the propagation-stopping
    // logic for nested groups. `contains()` is intentionally lax so that
    // untraversable (`tabindex=-1`) items still count as ours when focused.
    if (!this.#items.contains(current)) {
      return;
    }

    evt.stopPropagation();

    let target;

    switch (getNavigationDirection(evt, current, this.#axis)) {
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
      this.#advanceFocus(current, target, true);
      // Focus events don't cross shadow boundaries for moves within the
      // same shadow tree, so update #current directly here.
      this.#current = target;
      evt.preventDefault();
    }
  }

  /** @param {FocusEvent} evt */
  #handleFocusin(evt) {
    const target = evt.composedPath()[0];

    // When the owner is acting as a Tab-entry proxy, redirect focus to the
    // actual tab stop and disable the proxy so it doesn't create an extra stop.
    if (
      target === this.#owner &&
      this.#ownerIsProxy &&
      (!evt.relatedTarget || !nodeContains(this.#owner, evt.relatedTarget))
    ) {
      const tabStop = this.#current || this.#start;
      this.#disableFocusabilityProxy();
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
      this.#disableFocusabilityProxy();
    }

    const prev = this.#current;
    this.#current = target;

    if (prev === target) {
      return;
    }

    if (target.tabIndex < 0) {
      const transferFrom = prev ?? this.#start;
      if (transferFrom) {
        this.#advanceFocus(transferFrom, target);
      }
    }
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
        this.#enableFocusabilityProxy(tabStop);
      }
    }

    if (
      (evt.relatedTarget && this.#owner.contains(evt.relatedTarget)) ||
      this.#memory ||
      !this.#start
    ) {
      return;
    }

    // In nomemory mode, focus leaving the group resets the tab stop back to
    // the start (focusgroupstart or first item). Reset tabindex on currently-
    // decorated items and re-establish the start, without doing a full
    // undecorate+decorate cycle — the latter churns the owner proxy tabindex
    // synchronously inside focusout, which can race with the browser's
    // tab-target resolution and pull focus back to the owner proxy.
    if (!this.#memory && this.#start) {
      const prev = this.#current;

      this.#current = null;

      const nextStart = this.#items.start ?? this.#items.first?.() ?? null;

      if (prev !== this.#start || nextStart !== this.#start) {
        for (const { element, segmentBoundary } of this.#items.items()) {
          element.tabIndex = segmentBoundary ? 0 : -1;
        }

        if (nextStart) {
          nextStart.tabIndex = 0;
          this.#start = nextStart;
        }

        this.#items.flush?.();
      }
    }

    // Re-enable the owner as a Tab-entry proxy so Tab can re-enter the group.
    const tabStop = this.#memory ? this.#current || this.#start : this.#start;

    if (tabStop) {
      this.#enableFocusabilityProxy(tabStop);
    }
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
  #enableFocusabilityProxy(tabStop) {
    const rootNode = (tabStop.assignedSlot ?? tabStop).getRootNode();
    const hasFocusableHost =
      rootNode instanceof ShadowRoot &&
      rootNode.host.hasAttribute(DatasetName.AUTHOR_TABINDEX);

    if (this.#ownerIsProxy || !hasFocusableHost) {
      return;
    }

    this.#ownerTabindexBeforeProxy = this.#owner.getAttribute("tabindex");
    this.#owner.tabIndex = 0;
    this.#ownerIsProxy = true;

    flushAllObservers();
  }

  /** Undoes `#enableFocusabilityProxy`. */
  #disableFocusabilityProxy() {
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

    flushAllObservers();
  }

  /**
   * Advances the focusgroup's active tab stop from one item to another. Sets
   * the target's `tabindex` to `0` and optionally calls `focus()` on it. The
   * previous item's `tabindex` is set to `-1` unless it belongs to a different
   * segment (in which case it remains `0` as a segment tab stop). Also disables
   * the owner proxy.
   *
   * @param {HTMLElement} prev - The currently focused item.
   * @param {HTMLElement} next - The item to receive focus.
   * @param {boolean} [shouldCallFocus=false] - Whether to programmatically
   *     call `focus()` on the target element.
   */
  #advanceFocus(prev, next, shouldCallFocus = false) {
    next.tabIndex = 0;
    if (shouldCallFocus) {
      next.focus();
    }
    prev.tabIndex = (this.#items.sameSegment?.(prev, next) ?? true) ? -1 : 0;

    // Focus is moving within the group, so the owner proxy should stay
    // disabled (it was disabled in #handleFocusin). Just clear in case any
    // lingered.
    this.#disableFocusabilityProxy();

    flushAllObservers();
  }
}
