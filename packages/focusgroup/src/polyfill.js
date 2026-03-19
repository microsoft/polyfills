/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FocusGroup } from "./focusgroup.js";
import { createTreeWalker } from "./shadow-utils/index.js";
import { hasDocument, supportsFocusGroup } from "./utils.js";

/**
 * Polyfill the `focusgroup` HTML attribute for the given element and its
 * descendants.
 *
 * @param {HTMLElement} root - The polyfill target. Defaults to `<body>`.
 */
export function polyfill(root) {
  if (supportsFocusGroup() || !hasDocument()) {
    return;
  }

  if (!root) {
    root = document.body;
  }

  const walker = createTreeWalker(
    document,
    root,
    NodeFilter.SHOW_ELEMENT,
    (node) =>
      node.hasAttribute("focusgroup")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  );

  do {
    new FocusGroup(walker.currentNode);
  } while (walker.nextNode());
}
