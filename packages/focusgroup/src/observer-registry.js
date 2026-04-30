// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { state } from "./global-state.js";

/** @type {Set<MutationObserver>} */
export const observers = state.o;

/**
 * Flushes all globally registered focusgroup MutationObservers by calling
 * `takeRecords()` on each, discarding any pending mutation records that were
 * caused by polyfill-managed attribute writes. This prevents infinite
 * cross-group loops between nested focusgroups whose subtrees overlap.
 */
export function flushAllObservers() {
  for (const observer of observers) {
    observer.takeRecords();
  }
}
