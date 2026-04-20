// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Registry of all active focusgroup mutation observers. When any focusgroup
// writes polyfill-managed attributes (tabindex) during focus event handling,
// we flush *every* observer in this set so that no stale mutation records from
// cross-group writes survive into the next microtask — preventing unintended
// re-decoration from ancestor/descendant focusgroups whose subtrees overlap.
// Stored on `globalThis` in case the polyfill script is loaded multiple times.
globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS ??= new Set();

/** @type {Set<MutationObserver>} */
export const observers =
  globalThis.__FOCUSGROUP_POLYFILL_SHADOW_MUTATION_OBSERVERS;

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
