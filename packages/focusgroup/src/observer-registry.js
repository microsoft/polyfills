// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { state } from "./global-state.js";

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
 * Exclude only this exact managed write from every overlapping observer.
 * Pending author records (including same-value tabindex writes) are retained.
 * @param {HTMLElement} element
 * @param {string|null} value
 */
export function writeTabindex(element, value) {
  if (element.getAttribute("tabindex") === value) {
    return;
  }
  const write = { element, oldValue: element.getAttribute("tabindex") };
  for (const observer of observers) {
    observer.beginWrite(write);
  }
  try {
    if (value === null) {
      element.removeAttribute("tabindex");
    } else {
      element.setAttribute("tabindex", value);
    }
  } finally {
    for (const observer of observers) {
      observer.endWrite(write);
    }
  }
}
