/**
 * CSS border painter — renders gap decoration segments as positioned
 * div elements with CSS border properties, producing pixel-identical
 * output to native browser border rendering.
 */

import type {
  ComputedGapStyles,
  GapDataList,
  InsetValue,
  RuleOverlap,
} from "./properties.js";
import type { Segment } from "./segments.js";

const POLYFILL_ATTR = "data-gap-decorations-polyfill";

/**
 * The polyfill applies a few container-level styles via an adopted stylesheet
 * keyed on marker attributes, rather than mutating the container's inline
 * styles.
 *
 * - SUPPRESS_CRULE_ATTR: hide the browser's native `column-rule` on multicol
 *   containers where the polyfill renders the column rules itself (e.g. because
 *   of intersection breaks, insets, or multi-value lists native can't do).
 * - HOST_RELATIVE_ATTR: make a `position: static` container a containing block
 *   for the absolutely-positioned shadow overlay (grid/flex).
 * - HOST_STACKING_ATTR: make the container a stacking context so the overlay's
 *   `z-index: -1` paints behind in-flow items (important for semi-transparent
 *   items).
 */
const SUPPRESS_CRULE_ATTR = "data-gap-suppress-crule";
const HOST_RELATIVE_ATTR = "data-gap-host-relative";
const HOST_STACKING_ATTR = "data-gap-host-stacking";

let polyfillSheetAdded = false;
function ensurePolyfillStyleSheet(): void {
  if (polyfillSheetAdded) {
    return;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    `[${SUPPRESS_CRULE_ATTR}] { column-rule-style: none !important; }` +
      `[${HOST_RELATIVE_ATTR}] { position: relative; }` +
      `[${HOST_STACKING_ATTR}] { z-index: 0; }`,
  );
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  polyfillSheetAdded = true;
}

/**
 * Check whether the polyfill's column-rule rendering will differ from
 * native.  Returns true when any gap-decoration feature is active that
 * the browser's built-in column-rule doesn't support: row decorations,
 * non-default rule-break, insets, visibility filtering, or multi-value
 * width/style/color lists.
 */
function needsColumnRuleSuppression(
  styles: ComputedGapStyles,
  segments: Segment[],
): boolean {
  // Row decorations create intersection breaks in column rules.
  if (segments.some((s) => s.axis === "row")) {
    return true;
  }

  // Non-default column-rule-break (multicol default resolves to "intersection")
  const crBreak = styles["column-rule-break"];
  if (crBreak !== "normal" && crBreak !== "intersection") {
    return true;
  }

  // Visibility filtering beyond the native multicol default ("between")
  const crVis = styles["column-rule-visibility-items"];
  if (crVis !== "normal" && crVis !== "between") {
    return true;
  }

  // Any inset on column rules
  const zeroInset = (v: InsetValue) => v.type === "length" && v.value === 0;
  if (
    !zeroInset(styles["column-rule-inset-cap-start"]) ||
    !zeroInset(styles["column-rule-inset-cap-end"]) ||
    !zeroInset(styles["column-rule-inset-junction-start"]) ||
    !zeroInset(styles["column-rule-inset-junction-end"])
  ) {
    return true;
  }

  // Multi-value lists on column-rule width/style/color
  const isMultiValue = (list: GapDataList<unknown>) => list.length > 1;
  if (
    isMultiValue(styles["column-rule-width"]) ||
    isMultiValue(styles["column-rule-style"]) ||
    isMultiValue(styles["column-rule-color"])
  ) {
    return true;
  }

  return false;
}

/**
 * Paint segments into a positioned overlay on the given container element.
 *
 * The overlay is placed inside an open shadow root (before the
 * `<slot display:contents>`) so it doesn't appear in the light-DOM child list
 * — which avoids breaking :first-child / :nth-child selectors on content and
 * keeps the overlay clipped by the container's own overflow. The container is
 * made a containing block (`position: relative`) and stacking context
 * (`z-index: 0`) via adopted-stylesheet marker attributes so the overlay's
 * `z-index: -1` paints behind in-flow content. A wrapper-div strategy is
 * deliberately not used: it would sever subgrid's parent-child relationship,
 * sit outside the container's overflow clip, and change which element is the
 * layout item in an outer grid/flex.
 *
 * Multicol additionally suppresses the browser's native `column-rule` when the
 * polyfill renders features native column-rule can't (see
 * needsColumnRuleSuppression).
 */
export function paintSegments(
  container: Element,
  segments: Segment[],
  ruleOverlap: RuleOverlap,
  isVertical = false,
  styles?: ComputedGapStyles,
): void {
  const cs = getComputedStyle(container);
  const htmlEl = container as HTMLElement;
  const isMulticol =
    !cs.display.includes("grid") &&
    !cs.display.includes("flex") &&
    (cs.columnCount !== "auto" || cs.columnWidth !== "auto");

  // Make the container a containing block (for the absolutely-positioned
  // shadow overlay) and a stacking context (so the overlay's z-index:-1 paints
  // behind content). Applied via attribute-keyed adopted-stylesheet rules
  // instead of inline styles, so the container's own `style` attribute is never
  // touched. We only mark the container when the author's computed value is the
  // default — read here before our own rule can take effect — and never clear a
  // marker during paint (that would flip-flop against our own rule);
  // removeOverlay clears them. Applies to all container types (grid/flex/multicol).
  ensurePolyfillStyleSheet();
  if (cs.position === "static") {
    htmlEl.setAttribute(HOST_RELATIVE_ATTR, "");
  }
  if (cs.zIndex === "auto") {
    htmlEl.setAttribute(HOST_STACKING_ATTR, "");
  }

  // Multicol-only: suppress the browser's native column-rule when the polyfill
  // renders gap-decoration features native column-rule doesn't support (row
  // rules, rule-break, insets, visibility filtering, or multi-value lists).
  if (isMulticol) {
    if (styles && needsColumnRuleSuppression(styles, segments)) {
      htmlEl.setAttribute(SUPPRESS_CRULE_ATTR, "");
    } else {
      htmlEl.removeAttribute(SUPPRESS_CRULE_ATTR);
    }
  }

  const overlay = setupShadowOverlay(htmlEl, cs);

  // Clear previous content
  if (segments.length === 0) {
    overlay.textContent = "";
    return;
  }

  // Sort by rule-overlap: paint the "under" direction first
  const columnSegments = segments.filter((s) => s.axis === "column");
  const rowSegments = segments.filter((s) => s.axis === "row");

  const ordered =
    ruleOverlap === "column-over-row"
      ? [...rowSegments, ...columnSegments]
      : [...columnSegments, ...rowSegments];

  // Reuse existing child divs where possible to reduce DOM churn.
  const existing = overlay.children;
  let i = 0;
  for (const seg of ordered) {
    const el =
      i < existing.length
        ? (existing[i] as HTMLDivElement)
        : createSegmentDiv(overlay);
    applySegmentStyles(el, seg, isVertical);
    i++;
  }
  // Remove excess children from previous paints.
  while (overlay.children.length > i) {
    overlay.lastChild?.remove();
  }
}

/**
 * Remove the overlay from a container.
 */
export function removeOverlay(container: Element): void {
  const htmlEl = container as HTMLElement;

  // Remove the polyfill's marker attributes.
  htmlEl.removeAttribute(SUPPRESS_CRULE_ATTR);
  htmlEl.removeAttribute(HOST_RELATIVE_ATTR);
  htmlEl.removeAttribute(HOST_STACKING_ATTR);

  // The overlay lives in the container's shadow root.
  const shadow = htmlEl.shadowRoot;
  if (shadow) {
    const overlay = shadow.querySelector(`div[${POLYFILL_ATTR}]`);
    if (overlay) {
      overlay.remove();
    }
  }
}

/**
 * Set up overlay inside a shadow root.
 *
 * The overlay is inserted before the <slot> so that light-DOM content
 * (projected through the slot) paints on top of the decorations. The
 * container is promoted to a stacking context (z-index: 0) so the
 * overlay's z-index: -1 places it behind in-flow items — critical for
 * semi-transparent backgrounds like `rgba()` that would otherwise
 * reveal the overlay painting on top.
 *
 * This approach is preferred over a wrapper div because it preserves the
 * container's position in its parent layout and keeps the overlay inside the
 * container's overflow clip region. For multicol, the
 * `<slot display:contents>` projects the children back into the multicol
 * container so they still fragment into columns normally.
 */
function setupShadowOverlay(
  htmlEl: HTMLElement,
  cs: CSSStyleDeclaration,
): HTMLDivElement {
  let shadow: ShadowRoot | null = htmlEl.shadowRoot ?? null;
  if (!shadow) {
    shadow = htmlEl.attachShadow({ mode: "open" });
    const slot = document.createElement("slot");
    slot.style.display = "contents";
    shadow.appendChild(slot);
  }

  let overlay = shadow.querySelector(
    `div[${POLYFILL_ATTR}]`,
  ) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.setAttribute(POLYFILL_ATTR, "");
    overlay.style.position = "absolute";
    overlay.style.pointerEvents = "none";
    overlay.style.overflow = "visible";
    overlay.style.zIndex = "-1";
    shadow.insertBefore(overlay, shadow.firstChild);
  }

  // Position at the border-box origin (offset from padding box).
  // The overlay scrolls naturally with the container's content since
  // position:absolute elements inside scrollable containers move with
  // the scroll offset. Gap positions are in content space, so the
  // overlay must scroll with content to stay aligned.
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
  overlay.style.top = `${-borderTop}px`;
  overlay.style.left = `${-borderLeft}px`;

  return overlay;
}

/** Create and append a new segment div with static styles. */
function createSegmentDiv(overlay: HTMLDivElement): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.margin = "0";
  el.style.padding = "0";
  el.style.boxSizing = "border-box";
  overlay.appendChild(el);
  return el;
}

/** Apply segment-specific styles to an existing div. */
function applySegmentStyles(
  el: HTMLDivElement,
  seg: Segment,
  isVertical: boolean,
): void {
  const { start, end, center, axis, width, color } = seg;
  // A gap decoration rule sits in a gap with content on both sides and no
  // "interior", so the bevelled border styles render symmetrically: the
  // browser paints `inset` identically to `ridge` and `outset` identically
  // to `groove`. We render rules as a single div border edge, where `inset`
  // would instead paint as a flat dark line; map to ridge/groove to match
  // the engine's native gap-decoration painting. (Verified empirically
  // against Chromium's native column-rule rendering.)
  const style =
    seg.style === "inset"
      ? "ridge"
      : seg.style === "outset"
        ? "groove"
        : seg.style;

  const length = end - start;
  if (style === "none" || style === "hidden" || width <= 0 || length <= 0) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const borderValue = `${width}px ${style} ${color}`;

  // In vertical writing mode, column rules paint horizontally and
  // row rules paint vertically (axes swap compared to horizontal mode).
  const paintVertically = isVertical ? axis === "row" : axis === "column";

  if (paintVertically) {
    el.style.left = `${center - width / 2}px`;
    el.style.top = `${start}px`;
    el.style.width = "0";
    el.style.height = `${length}px`;
    el.style.borderRight = borderValue;
    el.style.borderBottom = "";
  } else {
    el.style.left = `${start}px`;
    el.style.top = `${center - width / 2}px`;
    el.style.width = `${length}px`;
    el.style.height = "0";
    el.style.borderBottom = borderValue;
    el.style.borderRight = "";
  }
}
