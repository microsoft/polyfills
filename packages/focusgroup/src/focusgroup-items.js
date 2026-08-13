// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @import {BehaviorToken} from "./constants.js"
 * @import {FocusGroup} from "./focusgroup.js"
 * @import {FocusGroupDefinition} from "./utils.js"
 */

/**
 * @typedef {Object} FocusGroupItem
 * @property {HTMLElement} element - The item element.
 * @property {boolean} [segmentBoundary] - When `true`, this entry starts a
 *   new focus-group segment (e.g. it crosses a nested focusgroup that should
 *   act as a segmentor).
 */

/**
 * Options accepted by `new FocusGroup(owner, items, options)`.
 *
 * @typedef {Object} FocusGroupOptions
 * @property {FocusGroupDefinition} [definition] - Behavior config. Plain
 *   data; FocusGroup just consumes it. Apps either build it themselves or call
 *   `parseDefinition(owner)` to derive it from the HTML `focusgroup` attribute.
 * @property {(element: HTMLElement, behavior: BehaviorToken|null) => void} [decorateOwner] -
 *   Optional hook called during owner (un)decoration. Receives the behavior
 *   token, or `null` when undecorating. Apps that don't need owner decoration
 *   omit this option, allowing the role-inference module to be tree-shaken.
 * @property {(element: HTMLElement, behavior: BehaviorToken|null) => void} [decorateItem] -
 *   Optional hook called during item (un)decoration. Receives the behavior
 *   token, or `null` when undecorating.
 * @property {(definition: FocusGroupDefinition) => FocusGroupItemCollection} [createItems] -
 *   Optional factory used when the focusgroup behavior changes.
 */

/**
 * Payload describing a batch of changes that require `FocusGroup` to
 * reconcile decoration state, passed to `FocusGroup#update()`.
 *
 * Callers populate the fields they can detect; if none are known, pass an
 * empty object (or omit it entirely) to mean "items changed, please refresh."
 *
 * @typedef {Object} FocusGroupUpdateInfo
 * @property {FocusGroupDefinition} [definition] - When
 *   provided, replaces the current definition. The polyfill computes this
 *   from the owner's `focusgroup` attribute when the attribute mutates.
 * @property {Node[]} [removedNodes] - Nodes removed from the owner subtree.
 * @property {HTMLElement[]} [authorTabindexChanges] - Decorated items whose
 *   author-set `tabindex` changed.
 */

/**
 * Interface for the object passed to `new FocusGroup(owner, items, options)`.
 * `FocusGroup` only depends on this shape — implementations can be plain
 * object literals, class instances, or anything else that satisfies the
 * contract.
 *
 * The collection's job is purely to expose the focus group's items and answer
 * queries about them. To trigger reconciliation when items change, call
 * `focusGroup.update(info)` from wherever the change is detected (the app, a
 * `MutationObserver` inside the collection, etc.).
 *
 * Lifecycle: `FocusGroup` calls `decorate()` to set up structural state
 * (e.g. mark items in the DOM, compute segments), then iterates `items()` to
 * apply behavioral state (tabindex, role). On teardown, `FocusGroup` iterates
 * `items()` first to roll back behavioral state, then calls `undecorate()` to
 * release the structural state. Collections whose `items()` is self-managed
 * (e.g. backed by a static array) can omit `decorate` / `undecorate` entirely.
 *
 * Minimal example backed by a plain array:
 *
 * ```js
 * const myItems = [el1, el2, el3];
 * const itemCollection = {
 *   *items() {
 *     for (const el of myItems) {
 *       yield { element: el };
 *     }
 *   },
 *   first: () => myItems[0] ?? null,
 *   last: () => myItems.at(-1) ?? null,
 *   next: (cur) => myItems[myItems.indexOf(cur) + 1] ?? null,
 *   previous: (cur) => myItems[myItems.indexOf(cur) - 1] ?? null,
 *   contains: (el) => myItems.includes(el),
 * };
 * ```
 *
 * For a class-based reference implementation, see `TreeWalkerItemCollection`.
 *
 * @typedef {Object} FocusGroupItemCollection
 *
 * @property {() => Iterable<FocusGroupItem>} items Returns an iterable of the
 *   collection's items, in DOM/tab order. `FocusGroup` iterates this during
 *   decoration and undecoration to apply or roll back `tabindex` and role.
 *   Each entry is a `FocusGroupItem` ({@link FocusGroupItem}); set
 *   `segmentBoundary` on the first item of a non-initial segment to make it
 *   tab-reachable.
 *
 * @property {() => (HTMLElement | null)} first The first item of the
 *   collection, or `null` if empty. Used by `FocusGroup` for `Home` /
 *   wrap-forward navigation, and as the fallback initial tab stop when `start`
 *   is not provided.
 *
 * @property {() => (HTMLElement | null)} last The last item of the collection,
 *   or `null` if empty. Used by `FocusGroup` for `End` / wrap-backward
 *   navigation.
 *
 * @property {(current: HTMLElement) => (HTMLElement | null)} next The item
 *   after `current` in tab order, or `null` if `current` is the last. Used by
 *   `FocusGroup` for forward arrow navigation.
 *
 * @property {(current: HTMLElement) => (HTMLElement | null)} previous The item
 *   before `current` in tab order, or `null` if `current` is the first. Used by
 *   `FocusGroup` for backward arrow navigation.
 *
 * @property {(event: KeyboardEvent, current: HTMLElement, definition: FocusGroupDefinition) => (HTMLElement | null)} [navigate]
 *   Optional behavior-specific navigation hook. When omitted, `FocusGroup`
 *   uses `first`, `last`, `next`, and `previous` for linear navigation.
 *
 * @property {(element: Element) => boolean} contains Lax membership check:
 *   should `element` be treated as belonging to this group for `focusin` /
 *   `keydown` purposes? Returns `true` for items, including untraversable
 *   (`tabindex="-1"`) ones. Used by `FocusGroup` to ignore events from nested
 *   focusgroups and from elements outside the group entirely. Contrast with
 *   `isItem(el)`, which is strict.
 *
 * @property {(HTMLElement | null)} [start] Optional initial tab stop
 *   after decoration. When provided and non-null, `FocusGroup` uses
 *   it instead of falling back to `first()`. The polyfill's default
 *   `TreeWalkerItemCollection` returns the first `[focusgroupstart]`
 *   descendant.
 *
 * @property {() => void} [decorate] Optional. Called by `FocusGroup` at the
 *   start of each decoration pass, before `items()` is iterated. Use this to
 *   set up structural state — e.g. mark items in the DOM, compute segments,
 *   refresh a cached item list. Omit if `items()` is self-managed.
 *
 * @property {() => void} [undecorate] Optional. Called by `FocusGroup` at the
 *   end of each undecoration pass, after `items()` is iterated. Use this to
 *   release the structural state set up in `decorate()`.
 *
 * @property {(element: Element) => boolean} [isItem] Optional strict membership
 *   check: is `element` currently a decorated item of *this* collection? Used
 *   by `FocusGroup` to validate the remembered tab stop after a re-decoration
 *   cycle. Falls back to `contains()` when omitted.
 *
 * @property {(element: HTMLElement) => boolean} [isSegmentStart] Optional
 *   spec-glue hook: is `element` the first item of a non-initial segment? Used
 *   by `FocusGroup` when re-applying `tabindex` after a no-memory reset to
 *   keep each segment's roving stop at `0`. Collections without segment support
 *   omit this.
 *
 * @property {(a: HTMLElement, b: HTMLElement) => boolean} [sameSegment]
 *   Optional spec-glue hook: are `a` and `b` in the same segment? Used by
 *   `FocusGroup` when the rover moves; if `false`, the previous item keeps
 *   `tabindex=0` so its segment stays tab-reachable. Collections without
 *   segment support omit this; `FocusGroup` then defaults to single-roving-stop
 *   behavior.
 *
 * @property {() => Iterable<{element: HTMLElement, item: HTMLElement}>} [itemControls]
 *   Optional V2 hook returning eligible opted-out controls and the owned item
 *   each control is associated with. `FocusGroup` uses these associations to
 *   remove controls of inactive items from sequential focus navigation.
 *
 * @property {() => void} [disconnect] Optional. Called defensively from
 *   `FocusGroup#disconnect()` (`items.disconnect?.()`). Use it to detach any
 *   observers or other resources owned by the collection.
 *
 * @property {(focusGroup: FocusGroup) => void} [observe] Optional. Called once
 *   after construction and whenever `FocusGroup` installs a replacement
 *   collection. Use it to connect observers that call `focusGroup.update()`.
 *
 * @property {() => void} [flush] Optional. Called by `FocusGroup` after
 *   writing polyfill-managed attributes (`tabindex`, `data-fg-*`) so the
 *   implementation can drop pending mutation records it would otherwise
 *   re-deliver. For `MutationObserver`-backed implementations this is typically
 *   `observer.takeRecords()`.
 */

export {};
