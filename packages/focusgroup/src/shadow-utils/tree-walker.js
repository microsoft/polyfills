/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * @see https://github.com/microsoft/tabster/tree/master/src/Shadowdomize
 */

import { getLastElementDescendant, nodeContains } from "./dom.js";

export class ShadowTreeWalker {
  filter;
  root;
  whatToShow;

  get currentNode() {
    return this.#currentNode;
  }

  set currentNode(node) {
    if (!nodeContains(this.root, node)) {
      throw new Error(
        "Cannot set currentNode to a node that is not contained by the root node.",
      );
    }

    this.#currentNode = node;
    this.#forwardStack = null;
    this.#backwardStack = null;
    this.#resetSlotted();
    this.#isLastDirectionForward = false;
  }

  /** @type {Document} */
  #doc;

  /** @type {Node} */
  #currentNode;

  /** @type {Array<{walker: TreeWalker, hostNode: Element|null}> | null} */
  #forwardStack = null;

  /** @type {Array<{walker: TreeWalker, hostNode: Element|null}> | null} */
  #backwardStack = null;

  /** @type {Element[]} */
  #slotted = [];

  /**
   * Tracks slotted elements whose children have been queued
   * @type {WeakSet<Element>}
   */
  #slottedWithChildren = new WeakSet();

  /** @type {boolean} */
  #isLastDirectionForward = true;

  constructor(doc, root, whatToShow, filter) {
    this.#doc = doc;
    this.root = root;
    this.filter = filter ?? null;
    this.whatToShow = whatToShow ?? NodeFilter.SHOW_ALL;
    this.#currentNode = root;
  }

  nextNode() {
    if (!this.#isLastDirectionForward) {
      this.#forwardStack = null;
      this.#resetSlotted();
      this.#isLastDirectionForward = true;
    }
    if (this.#forwardStack === null) {
      this.#forwardStack = this.#buildStack(true);
    }
    const previous = this.#currentNode;
    const result = this.#walkForward();
    if (result === null) {
      // Walk exhausted — keep currentNode at the last accepted node so
      // a subsequent direction reversal works without the caller having
      // to reassign currentNode.  Invalidate the forward stack so it
      // will be rebuilt from the (restored) position on the next call.
      this.#currentNode = previous;
      this.#forwardStack = null;
      this.#resetSlotted();
    }
    return result;
  }

  previousNode() {
    if (this.#isLastDirectionForward) {
      this.#backwardStack = null;
      this.#resetSlotted();
      this.#isLastDirectionForward = false;
    }

    if (this.#backwardStack === null) {
      this.#backwardStack = this.#buildStack(false);
    }
    const previous = this.#currentNode;
    const result = this.#walkBackward();
    if (result === null) {
      // Walk exhausted — keep currentNode at the last accepted node so
      // a subsequent direction reversal works without the caller having
      // to reassign currentNode.  Invalidate the backward stack so it
      // will be rebuilt from the (restored) position on the next call.
      this.#currentNode = previous;
      this.#backwardStack = null;
      this.#resetSlotted();
    }
    return result;
  }

  #resetSlotted() {
    this.#slotted = [];
    this.#slottedWithChildren = new WeakSet();
  }

  #filterNode = (node) => {
    if (typeof this.filter === "function") {
      return this.filter(node);
    } else if (this.filter?.acceptNode) {
      return this.filter.acceptNode(node);
    }
    return NodeFilter.FILTER_ACCEPT;
  };

  /**
   * Returns a filter callback for native TreeWalker nodes.
   *
   * Both directions accept shadow hosts and apply `#filterNode` to regular
   * elements. The only difference is a side effect: forward filters push a
   * new shadow walker onto `#forwardStack` when a shadow host is encountered
   * (the backward path handles shadow entry explicitly in `#walkBackward`).
   *
   * @param {boolean} isForward
   */
  #makeFilter(isForward) {
    return (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Reject light DOM children of shadow hosts — they should only
        // appear at their assigned <slot> position (or not at all).
        if (node.parentNode?.shadowRoot) {
          return NodeFilter.FILTER_REJECT;
        }

        // Accept <slot> elements that live inside a shadow tree so the
        // walk methods can intercept and expand them via assignedElements().
        if (
          node.localName === "slot" &&
          node.getRootNode() instanceof ShadowRoot
        ) {
          return NodeFilter.FILTER_ACCEPT;
        }

        const shadowRoot = node.shadowRoot;

        if (shadowRoot) {
          if (isForward) {
            // Guard: only push if the top of the stack isn't already rooted
            // at this shadow root (native TreeWalker may call the filter
            // multiple times for the same node).
            const top = this.#forwardStack[0];
            if (!top || top.walker.root !== shadowRoot) {
              const walker = this.#doc.createTreeWalker(
                shadowRoot,
                this.whatToShow,
                { acceptNode: this.#makeFilter(true) },
              );

              this.#forwardStack.unshift({ walker, hostNode: node });
            }
          }

          return NodeFilter.FILTER_ACCEPT;
        } else {
          return this.#filterNode(node);
        }
      }

      return NodeFilter.FILTER_SKIP;
    };
  }

  /**
   * Builds a direction-specific stack from `#currentNode` by walking up
   * through shadow roots to the walker's `root`.
   *
   * The stack is ordered innermost-first: index 0 is the walker whose root
   * contains `#currentNode` directly.
   *
   * @param {boolean} isForward
   * @returns {Array<{walker: TreeWalker, hostNode: Element|null}>}
   */
  #buildStack(isForward) {
    const makeFilter = () => this.#makeFilter(isForward);

    // If currentNode was removed from the DOM, reset to root.
    if (!nodeContains(this.root, this.#currentNode)) {
      this.#currentNode = this.root;
    }

    const stack = [];
    let currentNode = this.#currentNode;
    let walkerCurrentNode = this.#currentNode;

    // If currentNode is a slotted element, resolve to its assigned <slot>
    // so the upward walk proceeds through the shadow tree (where the slot
    // lives) rather than through the light DOM.  Also pre-populate the
    // slotted queue with remaining assigned siblings.
    const slot = this.#currentNode.assignedSlot;
    if (slot && nodeContains(this.root, slot)) {
      const assigned = [...slot.assignedElements({ flatten: true })];
      const idx = assigned.indexOf(this.#currentNode);

      if (isForward) {
        if (idx >= 0 && idx < assigned.length - 1) {
          this.#slotted = assigned.slice(idx + 1);
        }
      } else {
        if (idx > 0) {
          this.#slotted = assigned.slice(0, idx).reverse();
        }
      }

      // Continue the upward walk from the slot element itself.
      currentNode = walkerCurrentNode = slot;
    }

    // Walk up through shadow roots, creating a walker for each scope.
    while (currentNode && currentNode !== this.root) {
      if (currentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        const shadowRoot = currentNode;
        const walker = this.#doc.createTreeWalker(shadowRoot, this.whatToShow, {
          acceptNode: makeFilter(),
        });
        walker.currentNode = walkerCurrentNode;
        stack.push({ walker, hostNode: shadowRoot.host });

        currentNode = walkerCurrentNode = shadowRoot.host;
      } else {
        currentNode = currentNode.parentNode;
      }
    }

    // Create the root-level walker.
    const rootWalker = this.#doc.createTreeWalker(this.root, this.whatToShow, {
      acceptNode: makeFilter(),
    });
    rootWalker.currentNode = walkerCurrentNode;
    stack.push({ walker: rootWalker, hostNode: null });

    // Special case: if `this.root` is itself a shadow host and
    // `#currentNode` is `root` (or in root's light DOM — meaning we
    // didn't walk through root's shadow root above), push a shadow walker.
    const rootShadow = this.root.shadowRoot;
    if (rootShadow && !stack.some((e) => e.walker.root === rootShadow)) {
      const shadowWalker = this.#doc.createTreeWalker(
        rootShadow,
        this.whatToShow,
        { acceptNode: makeFilter() },
      );

      stack.unshift({ walker: shadowWalker, hostNode: this.root });
    }

    return stack;
  }

  /**
   * Forward traversal engine. Operates on `#forwardStack`.
   * Functionally identical to the old `nextNode()` body.
   */
  #walkForward() {
    // Drain the slot queue first — these are assigned elements from a
    // previously encountered <slot>.
    if (this.#slotted.length > 0) {
      const slottedEl = this.#slotted.shift();

      if (slottedEl.shadowRoot) {
        // The slotted element is itself a shadow host — push a walker
        // for its shadow tree onto the forward stack.
        const shadowRoot = slottedEl.shadowRoot;
        const walker = this.#doc.createTreeWalker(shadowRoot, this.whatToShow, {
          acceptNode: this.#makeFilter(true),
        });
        this.#forwardStack.unshift({ walker, hostNode: slottedEl });

        const nodeResult = this.#filterNode(slottedEl);
        if (nodeResult === NodeFilter.FILTER_ACCEPT) {
          this.#currentNode = slottedEl;
          return slottedEl;
        }
        return this.#walkForward();
      }

      // Splice light-DOM children into the front of #slotted so they
      // are walked in tree order before the next slotted sibling.
      if (slottedEl.firstElementChild) {
        this.#slotted.unshift(...slottedEl.children);
      }

      const nodeResult = this.#filterNode(slottedEl);
      if (nodeResult === NodeFilter.FILTER_ACCEPT) {
        this.#currentNode = slottedEl;
        return slottedEl;
      }
      return this.#walkForward();
    }

    const active = this.#forwardStack[0];
    if (!active) {
      return null;
    }

    const nextNode = active.walker.nextNode();

    if (nextNode) {
      // Intercept <slot> elements — expand them via assignedElements().
      if (nextNode.localName === "slot") {
        this.#slotted = [...nextNode.assignedElements({ flatten: true })];
        return this.#walkForward();
      }

      const shadowRoot = nextNode.shadowRoot;

      if (shadowRoot) {
        const nodeResult = this.#filterNode(nextNode);

        if (nodeResult === NodeFilter.FILTER_ACCEPT) {
          this.#currentNode = nextNode;
          return nextNode;
        }

        // The forward filter should have pushed a new shadow walker.
        // Recurse into it.
        return this.#walkForward();
      }

      this.#currentNode = nextNode;
      return nextNode;
    } else {
      // Walker exhausted — pop it.
      if (this.#forwardStack.length > 1) {
        this.#forwardStack.shift();
        return this.#walkForward();
      } else {
        return null;
      }
    }
  }

  /**
   * Backward traversal engine. Operates on `#backwardStack`.
   *
   * Unlike `#walkForward()`, this does NOT rely on filter side effects to
   * push shadow walkers. Instead, when a shadow host is encountered via
   * native `previousNode()`, it explicitly creates and pushes a shadow walker
   * positioned at the last descendant of the shadow root, then recurses.
   *
   * When a shadow walker is exhausted, the host is returned (if accepted by
   * the user filter), because in reverse tree order shadow children come
   * before the host.
   */
  #walkBackward() {
    // Drain the slot queue first — these are assigned elements from a
    // previously encountered <slot>, in reverse order.
    if (this.#slotted.length > 0) {
      const slottedEl = this.#slotted.shift();

      if (slottedEl.shadowRoot) {
        this.#currentNode = slottedEl;
        return this.#enterShadowBackward(slottedEl);
      }

      // In reverse tree order, descendants come before ancestors.
      // If this slotted element has children and hasn't had them queued yet,
      // re-queue: children (reversed) first, then the parent itself (marked
      // as expanded so it won't be expanded again).
      if (
        slottedEl.firstElementChild &&
        !this.#slottedWithChildren.has(slottedEl)
      ) {
        this.#slottedWithChildren.add(slottedEl);
        this.#slotted.unshift(...[...slottedEl.children].reverse(), slottedEl);
        return this.#walkBackward();
      }

      const nodeResult = this.#filterNode(slottedEl);
      if (nodeResult === NodeFilter.FILTER_ACCEPT) {
        this.#currentNode = slottedEl;
        return slottedEl;
      }
      return this.#walkBackward();
    }

    const active = this.#backwardStack[0];
    if (!active) {
      return null;
    }

    // If the active walker is at its root (shadow root), jump to the last
    // descendant — this handles the initial entry into a shadow scope when
    // the walker was just built or just pushed.
    if (
      active.walker.currentNode === active.walker.root &&
      active.walker.root !== this.root
    ) {
      const lastChild = getLastElementDescendant(active.walker.root);

      if (lastChild) {
        active.walker.currentNode = lastChild;

        const gen = this.#handleBackwardNode(lastChild);
        const { value, done } = gen.next();
        if (!done) {
          return value;
        }
        // Otherwise filter rejected — fall through to previousNode()
      }
    }

    const previousNode = active.walker.previousNode();

    if (previousNode && previousNode !== this.root) {
      const gen = this.#handleBackwardNode(previousNode);
      const { value, done } = gen.next();
      if (!done) {
        return value;
      }
      // In the previousNode path the native filter already accepted the
      // node, so #filterNode will too — this line is just a safety net.
      this.#currentNode = previousNode;
      return previousNode;
    } else {
      // Walker exhausted (or reached root).
      if (this.#backwardStack.length > 1) {
        this.#backwardStack.shift();

        // The hostNode from the popped entry is the shadow host — return
        // it if the user filter accepts it (host visited after all its
        // shadow content in reverse order).
        const hostNode = active.hostNode;
        if (hostNode && hostNode !== this.root) {
          const nodeResult = this.#filterNode(hostNode);

          if (nodeResult === NodeFilter.FILTER_ACCEPT) {
            this.#currentNode = hostNode;
            return hostNode;
          }
        }

        return this.#walkBackward();
      } else {
        return null;
      }
    }
  }

  /**
   * Handle a node encountered during backward traversal: expand <slot>s,
   * enter shadow hosts, or filter regular elements.
   *
   * Yields a value to return from #walkBackward, or returns with no
   * value to signal "fall through" (e.g. filter rejected the node in
   * the initial-entry path).
   *
   * @param {Element} node
   */
  *#handleBackwardNode(node) {
    if (node.localName === "slot") {
      this.#slotted = [...node.assignedElements({ flatten: true })].reverse();
      yield this.#walkBackward();
      return;
    }

    if (node.shadowRoot) {
      this.#currentNode = node;
      yield this.#enterShadowBackward(node);
      return;
    }

    const nodeResult = this.#filterNode(node);
    if (nodeResult === NodeFilter.FILTER_ACCEPT) {
      this.#currentNode = node;
      yield node;
    }
  }

  /**
   * Enter a shadow host's shadow root for backward traversal: create a new
   * shadow walker, push it onto `#backwardStack`, and recurse.
   *
   * @param {Element} hostNode - The shadow host to enter.
   */
  #enterShadowBackward(hostNode) {
    const shadowRoot = hostNode.shadowRoot;
    const walker = this.#doc.createTreeWalker(shadowRoot, this.whatToShow, {
      acceptNode: this.#makeFilter(false),
    });

    this.#backwardStack.unshift({ walker, hostNode });
    return this.#walkBackward();
  }
}
