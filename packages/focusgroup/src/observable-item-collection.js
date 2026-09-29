// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { observers } from "./observer-registry.js";
import { createTreeWalker } from "./shadow-utils/index.js";
import { checkVisibility } from "./utils.js";

/**
 * Shared observer lifecycle for focusgroup item collections.
 */
export class ObservableItemCollection {
  /** @type {MutationObserver | null} */
  #observer = null;

  /** @type {Map<HTMLElement, boolean>|null} */
  #rendering = null;

  /**
   * @param {HTMLElement} owner
   * @param {(records: MutationRecord[]) => void} onRecords
   * @param {MutationObserverInit} options
   * @param {(cb: MutationCallback) => MutationObserver} createObserver
   */
  startObserving(owner, onRecords, options, createObserver) {
    const captureRendering = () => {
      const result = new Map();
      const walker = createTreeWalker(
        owner.ownerDocument,
        owner,
        NodeFilter.SHOW_ELEMENT,
      );
      do {
        const element = /** @type {HTMLElement} */ (walker.currentNode);
        result.set(element, checkVisibility(element, owner));
      } while (walker.nextNode());
      return result;
    };
    if (options.attributeFilter?.includes("style")) {
      this.#rendering = captureRendering();
    }
    this.#observer = createObserver((records) => {
      const renderingOnly = records.every(
        (record) =>
          record.type === "attributes" &&
          (record.attributeName === "class" ||
            record.attributeName === "style"),
      );
      if (renderingOnly && this.#rendering) {
        // Selectors can affect siblings and ancestors (including :has()), not
        // just the mutated subtree. Check the entire previously captured scope.
        const unchanged = [...this.#rendering].every(
          ([element, visible]) => checkVisibility(element, owner) === visible,
        );
        if (unchanged) {
          return;
        }
      }
      this.#rendering = null;
      onRecords(records);
      if (renderingOnly) {
        this.#rendering = captureRendering();
      }
    });
    this.#observer.observe(owner, options);
    observers.add(this.#observer);
  }

  stopObserving() {
    observers.delete(this.#observer);
    this.#observer?.disconnect();
    this.#observer = null;
    this.#rendering = null;
  }

  flush() {
    if (this.#observer?.takeRecords().length) {
      this.#rendering = null;
    }
  }
}
