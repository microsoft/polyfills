// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { adoptControlWrites } from "./item-controls.js";
import { observers, rememberTabindexValues } from "./observer-registry.js";
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

  /** @type {MutationRecord[]} */
  #pending = [];

  /** @type {(() => void)|null} */
  #deliver = null;

  /** @type {Set<{element: HTMLElement, oldValue: string|null}>} */
  #managedWrites = new Set();

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
    this.#deliver = () => {
      const records = this.#pending;
      this.#pending = [];
      if (!records.length || !this.#observer) {
        return;
      }
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
      adoptControlWrites(records);
      onRecords(records);
      if (renderingOnly) {
        this.#rendering = captureRendering();
      }
    };
    this.#observer = createObserver((records) => {
      this.#enqueue(records);
      this.#deliver?.();
    });
    this.#observer.observe(owner, options);
    observers.add(this);
  }

  stopObserving() {
    observers.delete(this);
    this.#observer?.disconnect();
    this.#observer = null;
    this.#rendering = null;
    this.#pending = [];
    this.#deliver = null;
    this.#managedWrites.clear();
  }

  /**
   * Mark the write before touching the DOM: custom element reactions can
   * synchronously re-enter focus handling and drain observers again.
   * @param {{element: HTMLElement, oldValue: string|null}} write
   */
  beginWrite(write) {
    this.capture();
    this.#managedWrites.add(write);
  }

  /** @param {{element: HTMLElement, oldValue: string|null}} write */
  endWrite(write) {
    this.capture();
    this.#managedWrites.delete(write);
  }

  capture() {
    const records = this.#observer?.takeRecords() ?? [];
    rememberTabindexValues(records);
    for (const managedWrite of this.#managedWrites) {
      const index = records.findIndex(
        (record) =>
          record.type === "attributes" &&
          record.attributeName === "tabindex" &&
          record.target === managedWrite.element &&
          record.oldValue === managedWrite.oldValue,
      );
      if (index !== -1) {
        records.splice(index, 1);
        this.#managedWrites.delete(managedWrite);
      }
    }
    this.#enqueue(records, true);
  }

  /** @param {MutationRecord[]} records */
  #enqueue(records, remembered = false) {
    if (!records.length) {
      return;
    }
    if (!remembered) {
      rememberTabindexValues(records);
    }
    if (!this.#pending.length) {
      queueMicrotask(() => this.#deliver?.());
    }
    this.#pending.push(...records);
  }

  flush() {
    this.capture();
  }
}
