// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @see https://github.com/microsoft/tabster/tree/master/src/Shadowdomize */

import { nodeContains } from "./dom.js";

class ShadowMutationObserver {
  static #shadowObservers = new Set();

  #root;
  #options;
  #callback;
  #observer;
  #subObservers;
  #assignedObservers = new Map();
  #isObserving = false;

  // Slot reassignment changes the flat tree without a mutation under the
  // observed owner. An empty batch signals that topology needs refreshing.
  #onSlotChange = () => {
    const records = this.takeRecords();
    records.push(...this.#observeAssigned());
    if (records.length) {
      this.#callback(records, this);
    }
    this.#callback([], this);
  };

  static #overrideAttachShadow(win) {
    const origAttachShadow = win.Element.prototype.attachShadow;

    if (origAttachShadow.__origAttachShadow) {
      return;
    }

    Element.prototype.attachShadow = function (options) {
      const shadowRoot = origAttachShadow.call(this, options);

      for (const shadowObserver of ShadowMutationObserver.#shadowObservers) {
        shadowObserver.#addSubObserver(shadowRoot);
      }

      return shadowRoot;
    };

    Element.prototype.attachShadow.__origAttachShadow = origAttachShadow;
  }

  constructor(callback) {
    this.#callback = callback;
    this.#observer = new MutationObserver(this.#callbackWrapper);
    this.#subObservers = new Map();
  }

  #callbackWrapper = (mutations, observer) => {
    this.#trackShadows(mutations);
    if (this.#changesAssignment(mutations)) {
      mutations.push(...this.#observeAssigned());
    }
    this.#callback(mutations, observer);
  };

  #changesAssignment(records) {
    return records.some(
      (record) =>
        record.type === "childList" ||
        (record.type === "attributes" &&
          (record.attributeName === "slot" || record.attributeName === "name")),
    );
  }

  #observeAssigned() {
    const records = [];
    if (!this.#options?.subtree || !this.#isObserving) {
      return records;
    }
    const roots = [this.#root, ...this.#subObservers.keys()];
    const assigned = new Set();
    for (const root of roots) {
      const slots = [
        ...(root.matches?.("slot") ? [root] : []),
        ...root.querySelectorAll("slot"),
      ];
      for (const slot of slots) {
        for (const node of slot.assignedElements({ flatten: true })) {
          if (!roots.some((observedRoot) => observedRoot.contains(node))) {
            assigned.add(node);
          }
        }
      }
    }
    for (const [node, observer] of this.#assignedObservers) {
      if (!assigned.has(node)) {
        records.push(...observer.takeRecords());
        observer.disconnect();
        this.#assignedObservers.delete(node);
        if (!nodeContains(this.#root, node)) {
          this.#walkShadows(node, true);
        }
      }
    }
    for (const node of assigned) {
      if (!this.#assignedObservers.has(node)) {
        const observer = new MutationObserver(this.#callbackWrapper);
        observer.observe(node, this.#options);
        this.#assignedObservers.set(node, observer);
        this.#walkShadows(node);
      }
    }
    return records;
  }

  #trackShadows(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        const removed = mutation.removedNodes;
        const added = mutation.addedNodes;

        for (let i = 0; i < removed.length; i++) {
          this.#walkShadows(removed[i], true);
        }

        for (let i = 0; i < added.length; i++) {
          this.#walkShadows(added[i]);
        }
      }
    }
  }

  #addSubObserver(shadowRoot) {
    if (
      !this.#options ||
      !this.#callback ||
      this.#subObservers.has(shadowRoot)
    ) {
      return;
    }

    if (this.#options.subtree && nodeContains(this.#root, shadowRoot)) {
      const subObserver = new MutationObserver(this.#callbackWrapper);

      this.#subObservers.set(shadowRoot, subObserver);

      if (this.#isObserving) {
        subObserver.observe(shadowRoot, this.#options);
        shadowRoot.addEventListener("slotchange", this.#onSlotChange);
      }

      this.#walkShadows(shadowRoot);
    }
  }

  #removeSubObserver(shadowRoot) {
    const observer = this.#subObservers.get(shadowRoot);

    if (observer) {
      shadowRoot.removeEventListener("slotchange", this.#onSlotChange);
      observer.disconnect();
      this.#subObservers.delete(shadowRoot);
    }

    if (!this.#subObservers.size) {
      this.#subObservers.clear();
    }
  }

  disconnect() {
    this.#isObserving = false;

    this.#options = {};

    ShadowMutationObserver.#shadowObservers.delete(this);

    for (const shadowRoot of this.#subObservers.keys()) {
      this.#removeSubObserver(shadowRoot);
    }

    this.#observer.disconnect();
    for (const observer of this.#assignedObservers.values()) {
      observer.disconnect();
    }
    this.#assignedObservers.clear();
    this.#root?.removeEventListener("slotchange", this.#onSlotChange);
  }

  observe(target, options) {
    const doc =
      target.nodeType === Node.DOCUMENT_NODE ? target : target.ownerDocument;
    const win = doc?.defaultView;

    if (!doc || !win) {
      return;
    }

    ShadowMutationObserver.#overrideAttachShadow(win);
    ShadowMutationObserver.#shadowObservers.add(this);

    this.#root = target;
    this.#options = options;

    this.#isObserving = true;

    this.#observer.observe(target, options);
    if (options.subtree) {
      target.addEventListener("slotchange", this.#onSlotChange);
    }

    this.#walkShadows(target);
    this.#observeAssigned();
  }

  #walkShadows(target, remove) {
    const doc =
      target.nodeType === Node.DOCUMENT_NODE ? target : target.ownerDocument;

    if (!doc) {
      return;
    }

    if (target === doc) {
      target = doc.body;
    } else {
      const shadowRoot = target.shadowRoot;

      if (shadowRoot) {
        if (remove) {
          this.#walkShadows(shadowRoot, true);
          this.#removeSubObserver(shadowRoot);
        } else {
          this.#addSubObserver(shadowRoot);
        }

        return;
      }
    }

    const walker = doc.createTreeWalker(target, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (remove) {
            if (node.shadowRoot) {
              this.#walkShadows(node.shadowRoot, true);
              this.#removeSubObserver(node.shadowRoot);
            }
          } else {
            const shadowRoot = node.shadowRoot;

            if (shadowRoot) {
              this.#addSubObserver(shadowRoot);
            }
          }
        }

        return NodeFilter.FILTER_SKIP;
      },
    });

    walker.nextNode();
  }

  takeRecords() {
    const records = this.#observer.takeRecords();

    for (const subObserver of this.#subObservers.values()) {
      records.push(...subObserver.takeRecords());
    }
    for (const observer of this.#assignedObservers.values()) {
      records.push(...observer.takeRecords());
    }

    this.#trackShadows(records);
    if (this.#changesAssignment(records)) {
      records.push(...this.#observeAssigned());
    }
    return records;
  }
}

export function createMutationObserver(callback) {
  return new ShadowMutationObserver(callback);
}
