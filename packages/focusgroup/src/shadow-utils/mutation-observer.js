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
  #isObserving = false;

  // Slot reassignment changes the flat tree without a mutation under the
  // observed owner. An empty batch signals that topology needs refreshing.
  #onSlotChange = () => this.#callback([], this);

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
    this.#callback(mutations, observer);
  };

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

    this.#trackShadows(records);
    return records;
  }
}

export function createMutationObserver(callback) {
  return new ShadowMutationObserver(callback);
}
