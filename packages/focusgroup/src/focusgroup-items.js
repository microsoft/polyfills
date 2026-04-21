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
 * @property {(
 *     element: HTMLElement,
 *     behavior: BehaviorToken,
 *     kind: ("owner"|"child"|null),
 *   ) => void} [inferRole] - Optional role-inference hook. When provided,
 *   FocusGroup calls it during owner/item (un)decoration. Apps that declare
 *   their own ARIA roles in templates omit this option, allowing the
 *   role-inference module to be tree-shaken from the bundle. The polyfill entry
 *   passes `inferRole` from `utils.js`.
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
 *   id?: string,
 *   start?: (HTMLElement | null),
 *   items(): Iterable<FocusGroupItem>,
 *   first(): (HTMLElement | null),
 *   last(): (HTMLElement | null),
 *   next(current: HTMLElement): (HTMLElement | null),
 *   previous(current: HTMLElement): (HTMLElement | null),
 *   contains(element: Element): boolean,
 *   disconnect?: () => void,
 *   flush?: () => void,
 * }} FocusGroupItemCollection
 *
 * `id` is optional. When provided, `FocusGroup` writes it to the
 * `data-fg-item` attribute of each decorated item. Implementations whose
 * subtrees can overlap with other focusgroups (possible via shadow-DOM
 * slotting) should expose a unique `id` and use it inside their `contains()`
 * / navigation logic. Array-backed implementations don't need an `id`.
 *
 * `start` is optional. When provided and non-null, `FocusGroup` uses it as
 * the initial tab stop after decoration instead of falling back to the
 * first item. The polyfill's default `TreeWalkerItemCollection` returns
 * the first `[focusgroupstart]` descendant.
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
