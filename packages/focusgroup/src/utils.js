// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  BEHAVIOR_TOKENS,
  BehaviorMap,
  BehaviorToken,
  DatasetName,
} from "./constants.js";
import { createTreeWalker, getParentElement } from "./shadow-utils/index.js";

/**
 * Whether the current user agent has the `document` global object.
 *
 * @returns {boolean}
 */
export function hasDocument() {
  return typeof document !== "undefined";
}

/**
 * Whether the current user agent natively supports a focusgroup behavior.
 *
 * V2 behaviors (e.g. `grid`) are unconditionally polyfilled — see
 * `shouldPolyfillV2()` below for why — so this only reports native support
 * for the V1 surface (`document.body.focusGroup`).
 *
 * @param {BehaviorToken | null} [behavior]
 * @returns {boolean}
 */
export function supportsFocusGroup(behavior) {
  if (!hasDocument()) {
    return false;
  }
  const focusGroup = document.body.focusGroup;
  if (typeof focusGroup?.supports === "function") {
    return behavior ? focusGroup.supports(behavior) : true;
  }
  return false;
}

/**
 * V2 (e.g. `grid`) is still an early-stage, unstable explainer/spec: the
 * shape of the attribute and its behaviors can still change before any
 * browser ships a matching implementation. If the polyfill deferred to a
 * native implementation whenever one exists, sites could get caught in a
 * compatibility trap — a browser could ship a V2 implementation that matches
 * an older iteration of the spec than the one the polyfill (and the site)
 * has moved on to, silently changing behavior underneath the site once the
 * polyfill defers to it.
 *
 * To avoid that, usage of V2 behaviors is unconditionally polyfilled by
 * default, regardless of native support, until there's confidence the API
 * shape has stabilized (e.g. once a browser ships it). Authors can opt back
 * into deferring to a native implementation — e.g. for an origin trial, demo
 * site, or test that needs to exercise the native behavior — by setting
 * `globalThis.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__` to `true`.
 *
 * @param {BehaviorToken | null} [behavior]
 * @returns {boolean}
 */
export function shouldPolyfillV2(behavior) {
  return (
    behavior === BehaviorToken.GRID &&
    !globalThis?.__FOCUSGROUP_POLYFILL_ALLOW_NATIVE_V2__
  );
}

/**
 * @typedef {Object} FocusGroupDefinition
 * @property {BehaviorToken | null} [behavior]
 * @property {boolean} [wrap]
 * @property {("inline"|"block"|undefined)} [axis]
 * @property {boolean} [memory]
 * @property {("none"|"wrap"|"flow")} [rowEdge]
 * @property {("none"|"wrap"|"flow")} [colEdge]
 * @property {boolean} [manual]
 */

/**
 * Parse a `FocusGroupDefinition` from the owner element's `focusgroup`
 * attribute according to the HTML focusgroup spec. Used by `polyfill()` to
 * configure the `FocusGroup` constructor's `options.definition`.
 *
 * @param {HTMLElement} owner
 * @returns {FocusGroupDefinition}
 */
export function parseDefinition(owner) {
  const tokens = (owner.getAttribute("focusgroup") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const behavior =
    tokens.find((token) => BEHAVIOR_TOKENS.includes(token)) ?? null;
  const base = BehaviorMap[behavior];
  let wrap = base?.wrap ?? false;
  if (tokens.includes("wrap")) {
    wrap = true;
  } else if (tokens.includes("nowrap")) {
    wrap = false;
  }
  const hasInline = tokens.includes("inline");
  const hasBlock = tokens.includes("block");
  const axis =
    hasInline === hasBlock
      ? hasInline
        ? undefined
        : base?.axis
      : hasInline
        ? "inline"
        : "block";
  const resolveEdge = (wrapToken, flowToken) => {
    const hasWrap = tokens.includes(wrapToken) || tokens.includes("wrap");
    const hasFlow = tokens.includes(flowToken) || tokens.includes("flow");
    if (tokens.includes("nowrap") || (hasWrap && hasFlow)) {
      return "none";
    }
    return hasWrap ? "wrap" : hasFlow ? "flow" : "none";
  };
  const rowEdge = resolveEdge("rowwrap", "rowflow");
  const colEdge = resolveEdge("colwrap", "colflow");
  const definition = {
    behavior,
    wrap,
    axis,
    memory: !tokens.includes("nomemory"),
  };
  if (behavior === BehaviorToken.GRID) {
    Object.assign(definition, {
      manual: tokens.includes("manual"),
      rowEdge,
      colEdge,
    });
  }
  return definition;
}

/**
 * @typedef {(
 *   "grid-start" | "grid-end" | "row-start" | "row-end" |
 *   "inline-forward" | "inline-backward" |
 *   "block-forward" | "block-backward"
 * )} GridNavigationDirection
 */

/**
 * Collects keyboard modifier and writing-direction state shared by linear and
 * grid navigation.
 * @param {KeyboardEvent} event
 * @param {HTMLElement} owner
 */
function getKeyboardNavigationContext(event, owner) {
  const { writingMode, direction } = window.getComputedStyle(owner);
  return {
    commandModified: event.ctrlKey || event.metaKey,
    optionModified: event.shiftKey || event.altKey,
    writingMode,
    vertical: !writingMode.startsWith("horizontal-"),
    rtl: direction === "rtl",
  };
}

/**
 * Resolves the logical axis ("inline"/"block") and base direction (forward/
 * backward, before writing-mode/direction reversal) for one of the four
 * arrow keys. Returns `null` for any other key. Shared by
 * `getNavigationDirection()` and `getGridNavigationDirection()` so the
 * writing-mode-aware arrow-key mapping only lives in one place.
 *
 * `group` is the physical key pairing ("row" for Up/Down, "col" for
 * Left/Right) — kept distinct from `axis` because in vertical writing modes
 * the logical axis swaps (Up/Down becomes the inline axis) while the
 * reversal formula (see `isAxisReversed()`) still depends on which physical
 * pairing the key belongs to.
 *
 * @param {string} key
 * @param {boolean} vertical
 * @returns {{axis: "inline"|"block", group: "row"|"col", forward: boolean}|null}
 */
function getArrowKeyAxis(key, vertical) {
  const map = {
    ArrowLeft: {
      axis: vertical ? "block" : "inline",
      group: "col",
      forward: false,
    },
    ArrowRight: {
      axis: vertical ? "block" : "inline",
      group: "col",
      forward: true,
    },
    ArrowUp: {
      axis: vertical ? "inline" : "block",
      group: "row",
      forward: false,
    },
    ArrowDown: {
      axis: vertical ? "inline" : "block",
      group: "row",
      forward: true,
    },
  };
  return map[key] ?? null;
}

/**
 * Whether the given physical key pairing's direction is reversed given the
 * writing mode and direction. See `getArrowKeyAxis()` for `group`.
 *
 * @param {"row"|"col"} group
 * @param {string} writingMode
 * @param {boolean} vertical
 * @param {boolean} rtl
 * @returns {boolean}
 */
function isAxisReversed(group, writingMode, vertical, rtl) {
  if (group === "col") {
    return vertical ? writingMode.endsWith("-rl") !== rtl : rtl;
  }
  return vertical && rtl;
}

/**
 * Returns a grid operation for a directional key, accounting for writing mode
 * and direction.
 * @param {KeyboardEvent} event
 * @param {HTMLElement} owner
 * @returns {GridNavigationDirection|null}
 */
export function getGridNavigationDirection(event, owner) {
  const { commandModified, optionModified, writingMode, vertical, rtl } =
    getKeyboardNavigationContext(event, owner);
  if (commandModified && !optionModified && !(event.ctrlKey && event.metaKey)) {
    return event.key === "Home"
      ? "grid-start"
      : event.key === "End"
        ? "grid-end"
        : null;
  }
  if (optionModified || event.metaKey) {
    return null;
  }
  if (event.key === "Home") {
    return "row-start";
  }
  if (event.key === "End") {
    return "row-end";
  }
  const action = getArrowKeyAxis(event.key, vertical);
  if (!action) {
    return null;
  }
  const reversed = isAxisReversed(action.group, writingMode, vertical, rtl);
  const forward = reversed ? !action.forward : action.forward;
  return `${action.axis}-${forward ? "forward" : "backward"}`;
}

/**
 * Generate a page-wide unique ID for a focusgroup.
 * @returns {string}
 */
let focusgroupCount = 0;
export function generateUniqueId() {
  return String(focusgroupCount++);
}

/**
 * Whether the given element is keyboard focusable (tabbable).
 *
 * @param {HTMLElement} element
 * @param {HTMLElement=} owner
 * @param {boolean=} ignorePolyfillTabindex
 * @returns {boolean}
 */
export function isKeyboardFocusable(
  element,
  owner,
  ignorePolyfillTabindex = false,
) {
  return (
    // Is content editable
    (element.isContentEditable ||
      // A media element with controls, this check is necessary because
      // `tabIndex` is `-1` in WebKit in this case
      element.matches(":is(audio, video)[controls]") ||
      // Is tabbable
      element.tabIndex > -1 ||
      (ignorePolyfillTabindex &&
        element.hasAttribute(DatasetName.AUTHOR_TABINDEX) &&
        element.getAttribute(DatasetName.AUTHOR_TABINDEX) !== "none" &&
        Number(element.getAttribute(DatasetName.AUTHOR_TABINDEX)) > -1)) &&
    !(
      // Not disabled
      (
        element.disabled ||
        element.hasAttribute("disabled") ||
        // Not an anchor or area without href
        element.matches(":is(a, area):not([href])") ||
        // Not inert
        element.inert ||
        // Not hidden
        !checkVisibility(element, owner) ||
        // Not a media element without controls
        element.matches(":is(audio, video):not([controls])") ||
        // Has not been assigned a tabindex by the polyfill
        (!ignorePolyfillTabindex &&
          element.hasAttribute(DatasetName.AUTHOR_TABINDEX))
      )
    )
  );
}

/**
 * Gets the navigation direction (“forward” or “backward”) based on:
 *
 * - The key that the user just pressed
 * - The owner element’s writing mode and direction
 * - The current focus group’s directional limit (“inline”, “block”, none)
 *
 * @param {KeyboardEvent} event - The keyboard event object.
 * @param {HTMLElement} owner - The owner element.
 * @param {("inline" | "block" | undefined)} axis - The directional limitation.
 * @returns {("forward" | "backward" | "start" | "end" | null)} Returns `null`
 *     if there shouldn’t be navigation, e.g. when directional limit applies.
 */
export function getNavigationDirection(event, owner, axis) {
  if (isKeyConflictElement(event.composedPath()[0])) {
    return event.key === "Tab"
      ? event.shiftKey
        ? "backward"
        : "forward"
      : null;
  }

  const { commandModified, optionModified, writingMode, vertical, rtl } =
    getKeyboardNavigationContext(event, owner);

  if (optionModified || commandModified) {
    return null;
  }

  if (event.key === "Home") {
    return "start";
  }
  if (event.key === "End") {
    return "end";
  }

  const action = getArrowKeyAxis(event.key, vertical);
  if (!action || (axis && action.axis !== axis)) {
    return null;
  }

  const reversed = isAxisReversed(action.group, writingMode, vertical, rtl);
  const forward = reversed ? !action.forward : action.forward;
  return forward ? "forward" : "backward";
}

/**
 * Whether a given element has keyboard conflicts with navigation keys, in which
 * case they should be considered as segmentors.
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
export function isKeyConflictElement(el) {
  return (
    el?.nodeType === Node.ELEMENT_NODE &&
    // Is an editable form element
    ((["INPUT", "TEXTAREA", "SELECT"].includes(el.nodeName) &&
      !["checkbox", "radio"].includes(el.getAttribute("type"))) ||
      // Is content editable
      el.isContentEditable ||
      // Scrollable and scroll direction aligns with the direction limit
      // TODO
      // Element with preventDefault() on arrow keys
      (["AUDIO", "VIDEO"].includes(el.nodeName) &&
        el.hasAttribute("controls")) ||
      // iframes and object
      ["IFRAME", "OBJECT"].includes(el.nodeName))
  );
}

/**
 * Whether a nested focusgroup element creates a segment boundary.
 *
 * A segmentor is:
 * - A focusable element with focusgroup="none" (opted-out tab stop), or
 * - A non-focusable nested focusgroup whose subtree contains focusable
 *   elements (the subtree is an independent tab stop)
 *
 * @param {HTMLElement} element
 * @param {HTMLElement=} owner
 * @returns {boolean}
 */
export function isSegmentor(element, owner) {
  if (!checkVisibility(element)) {
    return false;
  }
  if (isKeyboardFocusable(element, owner)) {
    return element.getAttribute("focusgroup").includes(BehaviorToken.NONE);
  }
  const walker = createTreeWalker(document, element, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    if (
      walker.currentNode !== element &&
      isKeyboardFocusable(walker.currentNode, owner)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * A light-weight, non-comprehensive ponyfill for `Element.checkVisibility()`.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility
 * @param {HTMLElement} element - The element whose visibility to check.
 * @param {HTMLElement=} ancestor - An element in the ancestry chain of
 *     `element`. When provided, walk up from `element` to `ancestor`
 *     (inclusive) checking `visibility` and `content-visibility` on ancestors.
 *     When omitted, only `element` itself is checked.
 * @returns {boolean}
 */
export function checkVisibility(element, ancestor) {
  if ("checkVisibility" in Element.prototype) {
    return element.checkVisibility({
      visibilityProperty: true,
      contentVisibilityAuto: true,
    });
  }

  if (element.getClientRects().length === 0) {
    return false;
  }

  // Walk the ancestry chain checking two properties:
  // - `visibility: hidden/collapse` — hides the element itself, so check from
  //   `element` upward.
  // - `content-visibility: hidden` — hides an element's *content* (descendants,
  //   not itself), so check from `element`'s parent upward.
  let current = element;
  while (current) {
    const { visibility, contentVisibility } = window.getComputedStyle(current);
    if (["hidden", "collapse"].includes(visibility)) {
      return false;
    }
    if (current !== element && contentVisibility === "hidden") {
      return false;
    }
    if (!ancestor || current === ancestor) {
      break;
    }
    current = getParentElement(current);
  }

  return true;
}

/**
 * Infer or clear the ARIA role on a focusgroup element.
 *
 * Looks up the role from RoleMap for the given behavior and kind.
 * Sets the role if the element has no author-defined role (or already has an
 * inferred one). Clears a previously inferred role when the behavior has no
 * mapped role for that kind.
 *
 * @param {HTMLElement} element
 * @param {string} behavior - The focusgroup behavior token.
 * @param {"owner" | "child"} kind - Which role to look up from RoleMap.
 */
export function inferRole(element, behavior, kind) {
  const allowRoleInferring =
    hasGenericRole(element) ||
    (kind === "child" && element.nodeName === "BUTTON");
  const cfg = BehaviorMap[behavior];
  const role = allowRoleInferring
    ? kind === "owner"
      ? cfg?.ownerRole
      : cfg?.childRole
    : undefined;

  if (role) {
    if (
      !element.hasAttribute("role") ||
      element.hasAttribute(DatasetName.INFERRED_ROLE)
    ) {
      element.setAttribute("role", role);
      element.setAttribute(DatasetName.INFERRED_ROLE, "");
    }
  } else if (element.hasAttribute(DatasetName.INFERRED_ROLE)) {
    element.removeAttribute("role");
    element.removeAttribute(DatasetName.INFERRED_ROLE);
  }
}

/**
 * Whether the given element has a ARIA `generic` role.
 * NOTE: This function leverages a non-Baseline property, `computedRole`, and
 * falls back to only check if the given element is a `<div>`, a `<span>`, or a
 * custom element, which is far from comprehensive, but it should cover most of
 * the use cases and maintain reasonable performance. For a comprehensive list
 * of HTML elements with a `generic` role, see:
 * https://www.w3.org/TR/html-aria/#docconformance
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
export function hasGenericRole(element) {
  if ("computedRole" in HTMLElement.prototype) {
    return element.computedRole === "generic";
  }
  return (
    ["DIV", "SPAN"].includes(element.nodeName) || element.nodeName.includes("-")
  );
}
