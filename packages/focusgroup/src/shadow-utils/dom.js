// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @see https://github.com/microsoft/tabster/tree/master/src/Shadowdomize */

/**
 * Finds the closest element from the given element (inclusive) that matches the
 * given selector. Comparing to the native `Element.closest()`, it penatrates
 * shadow trees and considers slotted elements as children of their assigned
 * slot elements’ ancestors.
 *
 * @param {Element|ShadowRoot} start
 * @param {string} selector
 */
export function getClosestElement(start, selector) {
  if (!start || !selector) {
    return null;
  }

  if (start instanceof ShadowRoot) {
    return getClosestElement(start.host, selector);
  }

  const assignedSlot = start.assignedSlot;

  return assignedSlot
    ? // Element is slotted — check self, then traverse up through the slot's
      // ancestors, treating the slotted element as a child of the slot.
      start.matches(selector)
      ? start
      : getClosestElement(assignedSlot, selector)
    : (start.closest(selector) ??
        (start.getRootNode() instanceof ShadowRoot
          ? getClosestElement(start.getRootNode().host, selector)
          : null));
}

export function nodeContains(node, otherNode) {
  if (!node || !otherNode) {
    return false;
  }

  let currentNode = otherNode;

  while (currentNode) {
    if (currentNode === node) {
      return true;
    }

    if (
      typeof currentNode.assignedElements !== "function" &&
      currentNode.assignedSlot?.parentNode
    ) {
      // Element is slotted
      currentNode = currentNode.assignedSlot?.parentNode;
    } else if (currentNode.nodeType === document.DOCUMENT_FRAGMENT_NODE) {
      // Element is in shadow root
      currentNode = currentNode.host;
    } else {
      currentNode = currentNode.parentNode;
    }
  }

  return false;
}

/**
 * Gets the parent element of the given node, crossing shadow boundaries.
 * Like `Node.parentElement`, but:
 * - Slotted elements are treated as children of their assigned slot.
 * - Elements at a shadow root boundary return the shadow host.
 *
 * @param {Node} node
 * @returns {Element|null}
 */
export function getParentElement(node) {
  if (!node) {
    return null;
  }

  if (typeof node.assignedElements !== "function" && node.assignedSlot) {
    // Element is slotted — its logical parent is the assigned slot.
    return node.assignedSlot;
  }

  const root = node.getRootNode();
  if (root instanceof ShadowRoot) {
    // At the top of a shadow tree — cross into the host.
    return node.parentElement ?? root.host;
  }

  return node.parentElement;
}

export function getLastElementChild(node) {
  return node
    ? (node.lastElementChild ?? getLastElementChild(node.shadowRoot))
    : null;
}

export function getLastElementDescendant(container) {
  let descendant = null;

  for (
    let lastChild = getLastElementChild(container);
    lastChild;
    lastChild = getLastElementChild(lastChild)
  ) {
    descendant = lastChild;
  }

  return descendant;
}
