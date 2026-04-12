// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export const IS_SHADOWLESS = true;

export function getClosestElement(element, selector) {
  return element.closest(selector);
}

export function nodeContains(node, otherNode) {
  return node.contains(otherNode);
}

export function createMutationObserver(callback) {
  return new MutationObserver(callback);
}

export function createTreeWalker(doc, root, whatToShow, filter) {
  return doc.createTreeWalker(root, whatToShow, filter);
}

export function getParentElement(node) {
  return node.parentElement;
}
