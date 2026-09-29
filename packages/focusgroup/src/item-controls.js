// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { state } from "./global-state.js";
import { authoredTabindex, writeTabindex } from "./observer-registry.js";

/**
 * Multiple enclosing focusgroups can filter the same nested boundary. Keep
 * its authored tabindex until every owner releases it.
 * @type {Map<HTMLElement, {tabindex: string|null, owners: Map<object, boolean>}>}
 */
state.c ??= new Map();
const controls = state.c;

export function managedTabindex(element) {
  return controls.get(element)?.tabindex;
}

export function setItemTabindex(element, value) {
  const entry = controls.get(element);
  if (entry) {
    entry.tabindex = value;
    apply(element, entry);
  } else {
    writeTabindex(element, value);
  }
}

/**
 * Adopt author values retained by the observer, not the possibly overwritten
 * DOM value after a synchronous focus change.
 * @param {MutationRecord[]} records
 */
export function adoptControlWrites(records) {
  for (const record of records) {
    if (record.attributeName !== "tabindex") {
      continue;
    }
    const entry = controls.get(/** @type {HTMLElement} */ (record.target));
    if (entry) {
      entry.tabindex = authoredTabindex(record);
    }
  }
}

export function setControlActive(element, owner, active) {
  let entry = controls.get(element);
  if (!entry) {
    entry = { tabindex: element.getAttribute("tabindex"), owners: new Map() };
    controls.set(element, entry);
  }
  entry.owners.set(owner, active);
  apply(element, entry);
}

export function releaseControl(element, owner) {
  const entry = controls.get(element);
  if (!entry) {
    return;
  }
  entry.owners.delete(owner);
  apply(element, entry);
  if (!entry.owners.size) {
    controls.delete(element);
  }
}

function apply(element, entry) {
  const value = [...entry.owners.values()].every(Boolean)
    ? entry.tabindex
    : "-1";
  writeTabindex(element, value);
}
