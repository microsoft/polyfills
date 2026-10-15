// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { state } from "./global-state.js";
import { getParentElement } from "./shadow-utils/index.js";

state.p ??= new Set();
export const observers = state.p;

/** @type {WeakMap<MutationRecord, string|null>} */
const tabindexValues = new WeakMap();

/**
 * Capture values before a later managed write can overwrite them. A record's
 * new value is the next same-attribute record's oldValue, or the current value.
 * @param {MutationRecord[]} records
 */
export function rememberTabindexValues(records) {
  const values = new Map();
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.type !== "attributes" || record.attributeName !== "tabindex") {
      continue;
    }
    const element = /** @type {HTMLElement} */ (record.target);
    tabindexValues.set(
      record,
      values.has(element)
        ? values.get(element)
        : element.getAttribute("tabindex"),
    );
    values.set(element, record.oldValue);
  }
}

/** @param {MutationRecord} record */
export function authoredTabindex(record) {
  return tabindexValues.get(record);
}

/**
 * Index observers by root so each write captures only overlapping collections.
 * Unindexed observers from older bundles retain the original write protocol.
 * @type {{depth: number, roots: WeakMap<Element, Set<import("./observable-item-collection.js").ObservableItemCollection>>, unindexed: import("./observable-item-collection.js").ObservableItemCollection[]}}
 */
state.w ??= { depth: 0, roots: new WeakMap(), unindexed: [] };
const batch = state.w;

export function registerObserver(owner, observer) {
  let collections = batch.roots.get(owner);
  if (!collections) {
    collections = new Set();
    batch.roots.set(owner, collections);
  }
  collections.add(observer);
  observers.add(observer);
}

export function unregisterObserver(owner, observer) {
  batch.roots.get(owner)?.delete(observer);
  observers.delete(observer);
}

export function hasIndexedObserver(owner) {
  return !!batch.roots.get(owner)?.size;
}

function observersFor(element) {
  const result = new Set(
    batch.depth
      ? batch.unindexed.filter((observer) => observers.has(observer))
      : [...observers].filter((observer) => !observer.indexedWrites),
  );
  // Include both DOM ancestors and assigned-slot/host ancestors.
  const visited = new Set();
  const pending = [element];
  while (pending.length) {
    const node = pending.pop();
    if (!node || visited.has(node)) {
      continue;
    }
    visited.add(node);
    for (const observer of batch.roots.get(node) ?? []) {
      result.add(observer);
    }
    pending.push(node.parentElement, getParentElement(node));
  }
  return result;
}

/** @param {HTMLElement} [element] */
export function captureObservers(element) {
  for (const observer of element ? observersFor(element) : observers) {
    observer.capture();
  }
}

/**
 * Runs `fn` as one batch of managed writes. Observers are captured once when
 * the outermost batch opens and closes. Individual writes capture only their
 * overlapping owners, rather than every sibling collection in the document.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function batchWrites(fn) {
  if (!batch.depth) {
    batch.unindexed = [...observers].filter(
      (observer) => !observer.indexedWrites,
    );
    captureObservers();
  }
  batch.depth++;
  try {
    return fn();
  } finally {
    if (!--batch.depth) {
      for (const observer of observers) {
        observer.capture();
      }
      batch.unindexed = [];
    }
  }
}

/**
 * Exclude only this exact managed write from every overlapping observer.
 * Pending author records (including same-value tabindex writes) are retained.
 * @param {HTMLElement} element
 * @param {string|null} value
 */
export function writeTabindex(element, value) {
  const oldValue = element.getAttribute("tabindex");
  if (oldValue === value) {
    return;
  }
  batchWrites(() => {
    const write = { element, oldValue };
    const affected = observersFor(element);
    for (const observer of affected) {
      observer.beginWrite(write);
    }
    try {
      if (value === null) {
        element.removeAttribute("tabindex");
      } else {
        element.setAttribute("tabindex", value);
      }
    } finally {
      for (const observer of affected) {
        observer.endWrite(write);
      }
    }
  });
}
