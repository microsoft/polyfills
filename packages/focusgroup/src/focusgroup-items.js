// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @typedef {Object} FocusGroupItem
 * @property {HTMLElement} element - The item element.
 * @property {boolean} [segmentBoundary] - When `true`, this entry starts a
 *   new focus-group segment (e.g. it crosses a nested focusgroup that should
 *   act as a segmentor).
 */

/**
 * Contract for the object passed to `new FocusGroup(owner, items)`.
 *
 * Implementations extend `EventTarget` and dispatch a
 * `FocusGroupMutateEvent` (type `"mutate"`) whenever item membership, the
 * focusgroup definition, or author-set `tabindex` on a decorated item changes.
 *
 * @typedef {EventTarget & {
 *   id?: string,
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
 * `disconnect()` is optional — `FocusGroup#disconnect()` calls it defensively
 * (`items.disconnect?.()`).
 *
 * `flush()` is optional — `FocusGroup` calls it after writing
 * polyfill-managed attributes (`tabindex`, `data-fg-*`) so the implementation
 * can drop pending mutation records it would otherwise re-deliver. For
 * `MutationObserver`-backed implementations this is `observer.takeRecords()`.
 */

/**
 * Dispatched on a `FocusGroupItemCollection` instance whenever changes occur
 * that require `FocusGroup` to reconcile decoration state.
 *
 * Implementations populate the fields they can detect; app-supplied items
 * that don't track these signals can dispatch with no init at all to mean
 * "items changed, please refresh."
 */
export class FocusGroupMutateEvent extends Event {
  /**
   * @param {{
   *   definitionChanged?: boolean,
   *   removedNodes?: Node[],
   *   authorTabindexChanges?: HTMLElement[],
   * }} [init]
   */
  constructor(init = {}) {
    super("mutate");
    /** @type {boolean} */
    this.definitionChanged = !!init.definitionChanged;
    /** @type {Node[]} */
    this.removedNodes = init.removedNodes ?? [];
    /** @type {HTMLElement[]} */
    this.authorTabindexChanges = init.authorTabindexChanges ?? [];
  }
}
