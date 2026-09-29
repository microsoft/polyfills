// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Single shared bag of cross-module state, hung off `globalThis` so that
// multiple copies of the polyfill (e.g. duplicated bundles) coordinate via
// one registry. Short property names so bundlers can mangle local references
// freely; only the one long key on `globalThis` survives minification.
//
//   o: Set<ObservableItemCollection> — collection observers that distinguish
//      managed tabindex writes from pending author mutations.
//   m: Map<HTMLElement, FocusGroup> — element → polyfilled FocusGroup.
//   g: MutationObserver — singleton observer on `document.body` for
//      auto-disconnect on removal and (when `b` is true) auto-polyfill on add.
//   b: boolean — whether the global observer should also polyfill new nodes.
//   c: Map<HTMLElement, *> — shared itemcontrols filter for nested owners.
/**
 * @type {{ o: Set<import("./observable-item-collection.js").ObservableItemCollection>, m?: Map<HTMLElement, *>, g?: MutationObserver, b: boolean, c?: Map<HTMLElement, *> }}
 * @global
 */
globalThis.__FOCUSGROUP_POLYFILL__ ??= {
  o: new Set(),
  b: false,
};
export const state = globalThis.__FOCUSGROUP_POLYFILL__;
