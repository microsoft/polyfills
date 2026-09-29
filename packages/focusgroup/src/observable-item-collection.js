// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { observers } from "./observer-registry.js";

/**
 * Shared observer lifecycle for focusgroup item collections.
 */
export class ObservableItemCollection {
  /** @type {MutationObserver | null} */
  #observer = null;

  /**
   * @param {HTMLElement} owner
   * @param {(records: MutationRecord[]) => void} onRecords
   * @param {MutationObserverInit} options
   * @param {(cb: MutationCallback) => MutationObserver} createObserver
   */
  startObserving(owner, onRecords, options, createObserver) {
    this.#observer = createObserver((records) => onRecords(records));
    this.#observer.observe(owner, options);
    observers.add(this.#observer);
  }

  stopObserving() {
    observers.delete(this.#observer);
    this.#observer?.disconnect();
    this.#observer = null;
  }

  flush() {
    this.#observer?.takeRecords();
  }
}
