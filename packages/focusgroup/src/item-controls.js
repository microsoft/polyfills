// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { state } from "./global-state.js";

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
  } else if (value === null) {
    element.removeAttribute("tabindex");
  } else {
    element.setAttribute("tabindex", value);
  }
}

/** @type {WeakMap<MutationRecord[], Map<Node, MutationRecord>>} */
const lastWrites = new WeakMap();

/**
 * Whether a `tabindex` mutation record was caused by the control filter. Any
 * other write is adopted as the control's authored value.
 * Requires `attributeOldValue` on the observer.
 * @param {MutationRecord} record
 * @param {MutationRecord[]} records - The batch `record` was delivered in.
 */
export function isControlWrite(record, records) {
  const element = /** @type {HTMLElement} */ (record.target);
  const entry = controls.get(element);
  if (!entry) {
    return false;
  }
  let last = lastWrites.get(records);
  if (!last) {
    last = new Map();
    for (const r of records) {
      if (r.attributeName === "tabindex") {
        last.set(r.target, r);
      }
    }
    lastWrites.set(records, last);
  }
  // Only the batch's last write pairs its oldValue with the current value.
  // Earlier ones may include writes another observer already reconciled.
  if (last.get(element) !== record) {
    return true;
  }
  const current = element.getAttribute("tabindex");
  const expected = [...entry.owners.values()].every(Boolean)
    ? entry.tabindex
    : "-1";
  // `apply()` never rewrites an unchanged value, so a same-value write (e.g.
  // an author setting `tabindex="-1"` on an inactive control) is authored.
  if (current === expected && record.oldValue !== current) {
    return true;
  }
  entry.tabindex = current;
  apply(element, entry);
  return false;
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
  if (value === null) {
    element.removeAttribute("tabindex");
  } else if (element.getAttribute("tabindex") !== value) {
    element.setAttribute("tabindex", value);
  }
}
