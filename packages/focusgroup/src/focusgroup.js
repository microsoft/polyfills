// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { BehaviorToken, DatasetName } from "./constants.js";
import { state } from "./global-state.js";
import {
  managedTabindex,
  releaseControl,
  setControlActive,
  setItemTabindex,
} from "./item-controls.js";
import { writeTabindex } from "./observer-registry.js";
import {
  createTreeWalker,
  getParentElement,
  nodeContains,
} from "./shadow-utils/index.js";
import {
  checkVisibility,
  getNavigationDirection,
  isKeyboardFocusable,
  isTopLayer,
  parseDefinition,
  shouldDeferToNative,
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
   * @type {BehaviorToken | null}
   */
  #behavior = null;

  /**
   * Whether the focus group remembers the previously focused element.
   * Defaults to `true`.
   * @type {boolean}
   */
  #memory = true;

  /** @type {FocusGroupDefinition} */
  #definition = {};

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
   * Sequentially eligible nested content and its owner-relative item.
   * @type {Map<HTMLElement, HTMLElement>}
   */
  #itemControls = new Map();

  #reverseTab = false;

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
   * Called with `(owner, behavior, valid)` on decoration and `(owner, null)`
   * on undecoration. `valid` reflects the item collection's post-build
   * validity (e.g. `GridItemCollection#valid`) when applicable, and is
   * `undefined` for collections that don't expose it. When absent, no owner
   * decoration happens.
   * @type {((element: HTMLElement, behavior: BehaviorToken|null, valid?: boolean) => void) | undefined}
   */
  #decorateOwner;

  /**
   * Optional item-decoration hook injected via `options.decorateItem`.
   * Called with `(item, behavior)` on decoration and `(item, null)` on
   * undecoration. When absent, no item decoration happens.
   * @type {((element: HTMLElement, behavior: BehaviorToken|null) => void) | undefined}
   */
  #decorateItem;

  /** @type {((definition: FocusGroupDefinition) => FocusGroupItemCollection) | undefined} */
  #createItems;

  /**
   * Optional hook injected via `options.onNativeTakeover`, called with the
   * owner element when `update()` tears this instance down because the
   * owner's behavior changed to one the browser now natively supports (see
   * `update()`). Lets the caller (`polyfill.js`) remove the owner from its
   * tracking map so a later behavior change back to a polyfilled behavior
   * re-activates polyfilling instead of being silently ignored.
   * @type {((owner: HTMLElement) => void) | undefined}
   */
  #onNativeTakeover;

  /**
   * @param {HTMLElement!} owner - The focus group owner element.
   * @param {FocusGroupItemCollection} items - The items collection providing
   *     item discovery and queries.
   * @param {FocusGroupOptions} [options]
   */
  constructor(owner, items, options = {}) {
    if (!owner || shouldDeferToNative(options.definition)) {
      return;
    }

    this.#owner = owner;
    this.#items = items;
    this.#decorateOwner = options.decorateOwner;
    this.#decorateItem = options.decorateItem;
    this.#createItems = options.createItems;
    this.#onNativeTakeover = options.onNativeTakeover;

    this.#updateDefinition(options.definition);
    this.#decorateOwner?.(this.#owner, this.#behavior, this.#items?.valid);
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
    this.#owner.ownerDocument.addEventListener(
      "keydown",
      (event) => {
        this.#reverseTab = event.key === "Tab" && event.shiftKey;
      },
      { capture: true, ...opts },
    );
    this.#owner.ownerDocument.addEventListener(
      "keyup",
      () => {
        this.#reverseTab = false;
      },
      { capture: true, ...opts },
    );
    this.#items.observe?.(this);
  }

  /**
   * Tears down listeners and the collection, then restores proxy/control
   * tabindex. The collection adopts pending authored values before release.
   *
   * Other registered collections still exclude the teardown's managed writes.
   *
   * NOTE: This method does not undecorate the elements. Call it only after
   * the focusgroup owner has been removed from the DOM.
   */
  disconnect() {
    this.#abort.abort();
    this.#items?.disconnect?.();
    this.#disableFocusabilityProxy();
    this.#undecorateItemControls();
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

    // Apply author tabindex changes first: a behavior/topology change and an
    // author tabindex change can arrive in the same mutation batch, and the
    // definition-changed branch below may swap/undecorate the items
    // collection (which rewrites `data-fg-ati`) or tear this instance down
    // entirely. Applying the tabindex marker update up front ensures it's
    // never lost or overwritten by that swap.
    if (info.authorTabindexChanges) {
      for (const change of info.authorTabindexChanges) {
        const el = Array.isArray(change) ? change[0] : change;
        const saved = managedTabindex(el);
        const value = Array.isArray(change)
          ? change[1]
          : saved === undefined
            ? el.getAttribute("tabindex")
            : saved;
        el.setAttribute(DatasetName.AUTHOR_TABINDEX, value ?? "none");
      }
    }

    if (info.definition !== undefined) {
      const behaviorChanged = info.definition.behavior !== this.#behavior;

      if (
        (behaviorChanged ||
          info.definition.itemcontrols !== this.#definition.itemcontrols ||
          info.definition.noitemcontrols !== this.#definition.noitemcontrols) &&
        shouldDeferToNative(info.definition)
      ) {
        // The behavior changed to one the browser now natively supports
        // (and that we don't force-polyfill). Tear down entirely instead of
        // swapping in a different items collection and staying "polyfilled"
        // — otherwise this instance would keep managing an owner that
        // should be left to native handling. The global attribute-mutation
        // observer in `polyfill.js` will re-activate polyfilling later if
        // the behavior reverts to a polyfilled one.
        const owner = this.#owner;
        this.#undecorateItems();
        this.disconnect();
        this.#onNativeTakeover?.(owner);
        return;
      }

      const topologyChanged =
        (this.#behavior === "grid" &&
          info.definition.behavior === "grid" &&
          info.definition.manual !== this.#definition.manual) ||
        info.definition.itemcontrols !== this.#definition.itemcontrols;
      if ((behaviorChanged || topologyChanged) && this.#createItems) {
        this.#undecorateItems();
        this.#items.disconnect?.();
        this.#items = this.#createItems(info.definition);
        this.#updateDefinition(info.definition);
        this.#decorateOwner?.(this.#owner, this.#behavior, this.#items?.valid);
        this.#decorateItems();
        this.#items.observe?.(this);
        return;
      }
      this.#updateDefinition(info.definition);
      this.#decorateOwner?.(this.#owner, this.#behavior, this.#items?.valid);
    }

    this.#undecorateItems();
    this.#decorateItems();
  }

  /** @param {FocusGroupDefinition} [def] */
  #updateDefinition(def) {
    this.#definition = def ?? {};
    this.#behavior = def?.behavior ?? null;
    this.#memory = def?.memory ?? true;
    if (!this.#memory) {
      this.#current = null;
    }
  }

  #decorateItems() {
    if (!this.#behavior || this.#behavior === BehaviorToken.NONE) {
      this.#undecorateItems();
      return;
    }

    this.#items.decorate?.();

    for (const { element, segmentBoundary } of this.#items.items()) {
      // Set role
      this.#decorateItem?.(element, this.#behavior);

      // Set tabindex
      const saved = managedTabindex(element);
      element.setAttribute(
        DatasetName.AUTHOR_TABINDEX,
        (saved === undefined ? element.getAttribute("tabindex") : saved) ??
          "none",
      );
      setItemTabindex(element, segmentBoundary ? "0" : "-1");
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

    this.#current = this.#activeItem() ?? this.#current;

    const startItem =
      this.#current ?? this.#items.start ?? this.#items.first?.() ?? null;

    if (startItem) {
      setItemTabindex(startItem, "0");
      this.#start = startItem;
      this.#disableFocusabilityProxy();
      this.#enableFocusabilityProxy(startItem);
    }

    this.#decorateItemControls();

    this.#items.flush?.();
  }

  #undecorateItems() {
    this.#disableFocusabilityProxy();
    this.#undecorateItemControls();

    let undecorated = false;

    for (const { element } of this.#items.items()) {
      undecorated = true;

      // Restore role
      this.#decorateItem?.(element, null);

      // Restore tabindex
      const authorTabIndex = element.getAttribute(DatasetName.AUTHOR_TABINDEX);
      if (authorTabIndex) {
        if (authorTabIndex === "none") {
          setItemTabindex(element, null);
        } else {
          setItemTabindex(element, authorTabIndex);
        }
        element.removeAttribute(DatasetName.AUTHOR_TABINDEX);
      }
    }

    this.#items.undecorate?.();

    if (undecorated) {
      this.#items.flush?.();
    }
  }

  #decorateItemControls() {
    if (!this.#definition.itemcontrols || !this.#items.itemForNode) {
      return;
    }

    const walker = createTreeWalker(
      this.#owner.ownerDocument,
      this.#owner,
      NodeFilter.SHOW_ELEMENT,
    );
    while (walker.nextNode()) {
      const element = /** @type {HTMLElement} */ (walker.currentNode);
      const item = this.#associatedItem(element);
      if (item && this.#isEligibleControl(element)) {
        this.#itemControls.set(element, item);
      }
    }

    this.#applyItemControls(this.#activeItem());
  }

  #undecorateItemControls() {
    for (const element of this.#itemControls.keys()) {
      releaseControl(element, this);
    }
    this.#itemControls.clear();
  }

  /** @param {HTMLElement|null} activeItem */
  #applyItemControls(activeItem) {
    for (const [element, item] of this.#itemControls) {
      setControlActive(element, this, item === activeItem);
    }
    this.#items.flush?.();
  }

  #activeItem() {
    let target = this.#owner.ownerDocument.activeElement;
    while (target?.shadowRoot?.activeElement) {
      target = target.shadowRoot.activeElement;
    }
    if (!target || !nodeContains(this.#owner, target)) {
      return null;
    }
    return (
      this.#associatedItem(target) ??
      (this.#behavior === BehaviorToken.GRID && this.#items.contains(target)
        ? this.#items.itemForNode?.(target)
        : null) ??
      (this.#items.isItem?.(target) ? target : null)
    );
  }

  /** @param {HTMLElement} element */
  #associatedItem(element) {
    if (!this.#definition.itemcontrols || !nodeContains(this.#owner, element)) {
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
    // A nested owner associates independently through all enclosing owners;
    // otherwise this is the nearest parsed owner of the opted-out content.
    const boundary = nestedOwner ?? optOut;
    return boundary ? (this.#items.itemForNode?.(boundary) ?? null) : null;
  }

  /** @param {HTMLElement} element */
  #isEligibleControl(element) {
    for (
      let parent = element;
      parent && parent !== this.#owner;
      parent = getParentElement(parent)
    ) {
      if (state.m?.has(parent) && !state.m.get(parent)) {
        return false;
      }
    }
    // Nested rovers can change while an enclosing owner suppresses them.
    // Track their underlying tab stops, including the currently inactive ones.
    if (element.hasAttribute(DatasetName.AUTHOR_TABINDEX)) {
      return !element.disabled && checkVisibility(element, this.#owner);
    }
    const saved = managedTabindex(element);
    if (saved === undefined) {
      return (
        (!element.hasAttribute("tabindex") || element.tabIndex >= 0) &&
        isKeyboardFocusable(element, this.#owner, true)
      );
    }
    return (
      (saved === null || Number(saved) >= 0) &&
      isKeyboardFocusable(element, this.#owner, true, saved)
    );
  }

  /** @param {KeyboardEvent} evt */
  #handleKeydown(evt) {
    const current = evt.composedPath()[0];

    if (evt.defaultPrevented || current === this.#owner) {
      return;
    }

    // Only handle events targeted at our own items. The collection's
    // candidacy filter excludes opted-out subtrees and items owned by
    // nested focusgroups (via an ancestor walk), so this guard alone
    // prevents nested-group double-handling — no `stopPropagation` needed,
    // which keeps author event delegation working. `contains()` is
    // intentionally lax so that untraversable (`tabindex=-1`) items still
    // count as ours when focused.
    if (!this.#items.contains(current)) {
      return;
    }

    let target;

    if (this.#items.navigate) {
      target = this.#items.navigate(evt, current, this.#definition);
    } else {
      switch (getNavigationDirection(evt, current, this.#definition.axis)) {
        case "start":
          target = this.#items.first();
          break;
        case "end":
          target = this.#items.last();
          break;
        case "forward":
          target = this.#items.next(current);
          if (!target && this.#definition.wrap) {
            target = this.#items.first();
          }
          break;
        case "backward":
          target = this.#items.previous(current);
          if (!target && this.#definition.wrap) {
            target = this.#items.last();
          }
          break;
      }
    }

    if (target && target !== current) {
      this.#advanceFocus(current, target, true);
      // Focus events don't cross shadow boundaries for moves within the
      // same shadow tree, so update #current directly here.
      this.#current = target;
      this.#applyItemControls(this.#current);
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

    const associatedItem =
      this.#associatedItem(target) ??
      (this.#behavior === BehaviorToken.GRID && this.#items.contains(target)
        ? this.#items.itemForNode?.(target)
        : null);
    if (!associatedItem && !this.#items.contains(target)) {
      this.#applyItemControls(null);
      return;
    }

    if (
      associatedItem &&
      this.#reverseTab &&
      evt.relatedTarget &&
      !nodeContains(this.#owner, evt.relatedTarget)
    ) {
      associatedItem.focus();
      return;
    }

    // Once focus is inside the group, disable the owner proxy so it doesn't
    // create an extra Tab stop when the user Shift+Tabs out.
    if (this.#ownerIsProxy) {
      this.#disableFocusabilityProxy();
    }

    const prev = this.#current;
    this.#current = associatedItem ?? target;

    if (prev === this.#current) {
      this.#applyItemControls(this.#activeItem());
      return;
    }

    this.#applyItemControls(this.#current);

    if (associatedItem && associatedItem.tabIndex < 0) {
      const transferFrom = prev ?? this.#start;
      if (transferFrom && transferFrom !== associatedItem) {
        this.#advanceFocus(transferFrom, associatedItem);
      }
    } else if (!associatedItem && target.tabIndex < 0) {
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
      this.#applyItemControls(null);
      const tabStop = this.#memory ? this.#current || this.#start : this.#start;
      if (tabStop) {
        this.#enableFocusabilityProxy(tabStop);
      }
    }

    if (
      (evt.relatedTarget && nodeContains(this.#owner, evt.relatedTarget)) ||
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
    const prev = this.#current;

    this.#current = null;

    const nextStart = this.#items.start ?? this.#items.first?.() ?? null;

    if (prev !== this.#start || nextStart !== this.#start) {
      for (const { element, segmentBoundary } of this.#items.items()) {
        setItemTabindex(element, segmentBoundary ? "0" : "-1");
      }

      if (nextStart) {
        setItemTabindex(nextStart, "0");
        this.#start = nextStart;
      }

      this.#items.flush?.();
    }
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
    writeTabindex(this.#owner, "0");
    this.#ownerIsProxy = true;
  }

  /** Undoes `#enableFocusabilityProxy`. */
  #disableFocusabilityProxy() {
    if (!this.#ownerIsProxy) {
      return;
    }

    writeTabindex(this.#owner, this.#ownerTabindexBeforeProxy);

    this.#ownerIsProxy = false;
    this.#ownerTabindexBeforeProxy = null;
    this.#items.flush?.();
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
    setItemTabindex(next, "0");
    if (shouldCallFocus) {
      next.focus();
    }
    setItemTabindex(
      prev,
      (this.#items.sameSegment?.(prev, next) ?? true) ? "-1" : "0",
    );

    // Focus is moving within the group, so the owner proxy should stay
    // disabled (it was disabled in #handleFocusin). Just clear in case any
    // lingered.
    this.#disableFocusabilityProxy();
  }
}
