/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FocusGroup } from "./focusgroup.js";
import { ShadowTreeWalker } from "./shadow-utils/tree-walker.js";
import { supportsFocusGroup } from "./utils.js";

/**
 * Polyfill the `focusgroup` HTML attribute for the given element and its
 * descendants.
 *
 * @param {HTMLElement} root - The polyfill target. Defaults to `<body>`.
 */
export function polyfill(root = document.body) {
  if (supportsFocusGroup() || !root) {
    return;
  }

  const walker = new ShadowTreeWalker(
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
