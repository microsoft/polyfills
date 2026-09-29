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

export function isControlWrite(element) {
  const entry = controls.get(element);
  if (!entry) {
    return false;
  }
  const current = element.getAttribute("tabindex");
  const expected = [...entry.owners.values()].every(Boolean)
    ? entry.tabindex
    : "-1";
  if (current === expected) {
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
