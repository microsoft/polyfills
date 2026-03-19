export function getClosestElement(element, selector) {
  return element.getClosestElement(selector);
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
