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

    this.#callback(mutations, observer);
  };

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
      }

      this.#walkShadows(shadowRoot);
    }
  }

  #removeSubObserver(shadowRoot) {
    const observer = this.#subObservers.get(shadowRoot);

    if (observer) {
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
          const subObserver = this.#subObservers.get(shadowRoot);

          if (subObserver) {
            subObserver.disconnect();
            this.#subObservers.delete(shadowRoot);
          }
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
            const subObserver = this.#subObservers.get(node);

            if (subObserver) {
              subObserver.disconnect();
              this.#subObservers.delete(node);
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

    return records;
  }
}

export function createMutationObserver(callback) {
  return new ShadowMutationObserver(callback);
}
