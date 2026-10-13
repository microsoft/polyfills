// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** @enum {string} */
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

/** @enum {string} */
export const BehaviorToken = {
  TOOLBAR: "toolbar",
  TABLIST: "tablist",
  RADIOGROUP: "radiogroup",
  LISTBOX: "listbox",
  MENU: "menu",
  MENUBAR: "menubar",
  FEED: "feed",
  GRID: "grid",
  NONE: "none",
};

/** @enum {string} */
export const ModifierToken = {
  ITEMCONTROLS: "itemcontrols",
  NOITEMCONTROLS: "noitemcontrols",
};
export const BEHAVIOR_TOKENS = [
  BehaviorToken.TOOLBAR,
  BehaviorToken.TABLIST,
  BehaviorToken.RADIOGROUP,
  BehaviorToken.LISTBOX,
  BehaviorToken.MENU,
  BehaviorToken.MENUBAR,
  BehaviorToken.FEED,
  BehaviorToken.GRID,
  BehaviorToken.NONE,
];

/**
 * @typedef {Object} Behavior
 * @property {string} ownerRole
 * @property {(string|null)} childRole
 * @property {boolean} wrap
 * @property {("inline"|"block"|undefined)} axis
 * @property {boolean} itemControls
 */

/** @type {Record<BehaviorToken, Behavior>} */
export const BehaviorMap = {
  toolbar: {
    ownerRole: "toolbar",
    childRole: null,
    wrap: false,
    axis: "inline",
    itemControls: false,
  },
  tablist: {
    ownerRole: "tablist",
    childRole: "tab",
    wrap: true,
    axis: "inline",
    itemControls: false,
  },
  radiogroup: {
    ownerRole: "radiogroup",
    childRole: "radio",
    wrap: true,
    axis: undefined,
    itemControls: false,
  },
  listbox: {
    ownerRole: "listbox",
    childRole: "option",
    wrap: false,
    axis: "block",
    itemControls: false,
  },
  menu: {
    ownerRole: "menu",
    childRole: "menuitem",
    wrap: true,
    axis: "block",
    itemControls: false,
  },
  menubar: {
    ownerRole: "menubar",
    childRole: "menuitem",
    wrap: true,
    axis: "inline",
    itemControls: false,
  },
  feed: {
    ownerRole: "feed",
    childRole: "article",
    wrap: false,
    axis: "block",
    itemControls: true,
  },
  grid: {
    ownerRole: "grid",
    childRole: "gridcell",
    wrap: false,
    axis: undefined,
    itemControls: true,
  },
};
