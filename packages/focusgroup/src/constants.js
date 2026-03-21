// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export const DatasetName = {
  // Whether the polyfill added an inferred role to the element due to lack of
  // explicit author role.
  INFERRED_ROLE: "data-fg-ir",

  // Whether the element is a focus group item.
  ITEM: "data-fg-item",

  // The value of tabindex defined by the author before the polyfill decoration.
  AUTHOR_TABINDEX: "data-fg-ati",

  // Which focus group segment does the current item belong to.
  SEGMENT: "data-fg-seg",

  // Which focus group segment does the current item belong to.
  SEGMENT_START: "data-fg-segs",
};

export const BehaviorToken = {
  TOOLBAR: "toolbar",
  TABLIST: "tablist",
  RADIOGROUP: "radiogroup",
  LISTBOX: "listbox",
  MENU: "menu",
  MENUBAR: "menubar",
  NONE: "none",
};
export const BEHAVIOR_TOKENS = Object.values(BehaviorToken);

/**
 * @typedef {Object} Behavior
 * @property {string} ownerRole
 * @property {(string|null)} childRole
 * @property {boolean} wrap
 * @property {("inline"|"block"|undefined)} axis
 */

/** @type {Map<BehaviorToken, Behavior>} */
export const BehaviorMap = new Map([
  [
    BehaviorToken.TOOLBAR,
    { ownerRole: "toolbar", childRole: null, wrap: false, axis: "inline" },
  ],
  [
    BehaviorToken.TABLIST,
    { ownerRole: "tablist", childRole: "tab", wrap: true, axis: "inline" },
  ],
  [
    BehaviorToken.RADIOGROUP,
    {
      ownerRole: "radiogroup",
      childRole: "radio",
      wrap: false,
      axis: undefined,
    },
  ],
  [
    BehaviorToken.LISTBOX,
    { ownerRole: "listbox", childRole: "option", wrap: false, axis: undefined },
  ],
  [
    BehaviorToken.MENU,
    { ownerRole: "menu", childRole: "menuitem", wrap: true, axis: "block" },
  ],
  [
    BehaviorToken.MENUBAR,
    { ownerRole: "menubar", childRole: "menuitem", wrap: true, axis: "inline" },
  ],
]);
