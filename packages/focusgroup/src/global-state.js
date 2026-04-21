// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Single shared bag of cross-module state, hung off `globalThis` so that
// multiple copies of the polyfill (e.g. duplicated bundles) coordinate via
// one registry. Short property names so bundlers can mangle local references
// freely; only the one long key on `globalThis` survives minification.
//
//   o: Set<MutationObserver> — every focusgroup MutationObserver, flushed
//      together during focus events to discard stale records from
//      polyfill-managed attribute writes (prevents cross-group loops).
//   m: Map<HTMLElement, FocusGroup> — element → polyfilled FocusGroup.
//   g: MutationObserver — singleton observer on `document.body` for
//      auto-disconnect on removal and (when `b` is true) auto-polyfill on add.
//   b: boolean — whether the global observer should also polyfill new nodes.
/** @type {{ o: Set<MutationObserver>, m?: Map<HTMLElement, *>, g?: MutationObserver, b: boolean }} */
globalThis.__FOCUSGROUP_POLYFILL__ ??= {
  o: new Set(),
  b: false,
};
export const state = globalThis.__FOCUSGROUP_POLYFILL__;
