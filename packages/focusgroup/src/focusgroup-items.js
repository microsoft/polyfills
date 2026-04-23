// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @import {BehaviorToken} from "./constants.js"
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
 * Contract for the object passed to `new FocusGroup(owner, items)`.
 *
 * The collection's job is purely to expose the focus group's items and
 * answer queries about them. To trigger reconciliation when items change,
 * call `focusGroup.update(info)` from wherever the change is detected (the
 * app, a `MutationObserver` inside the collection, etc.).
 *
 * @typedef {{
 *   start?: (HTMLElement | null),
 *   items(): Iterable<FocusGroupItem>,
 *   first(): (HTMLElement | null),
 *   last(): (HTMLElement | null),
 *   next(current: HTMLElement): (HTMLElement | null),
 *   previous(current: HTMLElement): (HTMLElement | null),
 *   contains(element: Element): boolean,
 *   decorate?: () => void,
 *   undecorate?: () => void,
 *   isItem?: (element: Element) => boolean,
 *   isSegmentStart?: (element: HTMLElement) => boolean,
 *   sameSegment?: (a: HTMLElement, b: HTMLElement) => boolean,
 *   disconnect?: () => void,
 *   flush?: () => void,
 * }} FocusGroupItemCollection
 *
 * Lifecycle: `FocusGroup` calls `decorate()` to ask the collection to set
 * up structural state (e.g. mark items in the DOM, compute segments), then
 * iterates `items()` to apply behavioral state (tabindex, role). On
 * teardown, `FocusGroup` iterates `items()` first to roll back behavioral
 * state, then calls `undecorate()` to release the structural state. Custom
 * collections whose `items()` is self-managed (e.g. backed by a static
 * array) can omit `decorate` / `undecorate` entirely.
 *
 * `isItem(el)` is an optional strict membership check answering "is `el`
 * currently a decorated item of this collection?". Used by `FocusGroup`
 * when validating the memorized element after a re-decoration cycle, and
 * (in keydown) to guard against handling events from elements that aren't
 * ours. Differs from `contains(el)` in that `contains` is intentionally
 * lax — it includes untraversable (e.g. `tabindex=-1`) elements that
 * `focusin` should still treat as belonging to the group.
 *
 * `start` is optional. When provided and non-null, `FocusGroup` uses it as
 * the initial tab stop after decoration instead of falling back to the
 * first item. The polyfill's default `TreeWalkerItemCollection` returns
 * the first `[focusgroupstart]` descendant.
 *
 * `isSegmentStart` and `sameSegment` are optional spec-glue hooks. The
 * polyfill's `TreeWalkerItemCollection` uses them to preserve the per-segment
 * roving tab stop produced by nested focusgroups acting as segmentors:
 * - `isSegmentStart(el)` — is `el` the first item of a non-initial segment?
 *   Used by `FocusGroup` when re-applying tabindexes after a no-memory reset
 *   to keep each segment's roving stop at `0`.
 * - `sameSegment(a, b)` — are `a` and `b` in the same segment? Used by
 *   `FocusGroup` when the rover moves; if `false`, the previous item keeps
 *   `tabindex=0` so the segment it belonged to remains tab-reachable.
 * Collections that don't implement segment behavior (e.g. FUI components
 * with flat item lists) omit both methods. `FocusGroup` then defaults to
 * single-roving-stop behavior.
 *
 * `disconnect()` is optional — `FocusGroup#disconnect()` calls it defensively
 * (`items.disconnect?.()`).
 *
 * `flush()` is optional — `FocusGroup` calls it after writing
 * polyfill-managed attributes (`tabindex`, `data-fg-*`) so the implementation
 * can drop pending mutation records it would otherwise re-deliver. For
 * `MutationObserver`-backed implementations this is `observer.takeRecords()`.
 */

export {};
