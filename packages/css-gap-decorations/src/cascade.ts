/**
 * Cascade layer — discovers gap-decoration containers and reads their resolved
 * styles.
 *
 * The CSS cascade itself (selector matching, specificity, source order,
 * !important, @layer, var()) is delegated to the browser's native engine via
 * the custom-property "shift" strategy in shift.ts: gap-decoration declarations
 * are rewritten into `--gdp-<longhand>` custom properties, and resolved values
 * are read back with getComputedStyle. This module is therefore only
 * responsible for (a) detecting container types and (b) enumerating the
 * candidate elements that need painting.
 */

import type { ParsedDeclaration } from "./parse.js";
import type { ComputedGapStyles } from "./properties.js";
import { collectInlineGapElements, readComputedGapStyles } from "./shift.js";

/** Read the natively-cascaded gap-decoration styles for an element. */
export function getComputedGapStyles(el: Element): ComputedGapStyles {
  return readComputedGapStyles(el);
}

export type ContainerType = "grid" | "flex" | "multicol" | null;

/** Detect what type of gap container an element is. */
export function detectContainerType(el: Element): ContainerType {
  const cs = getComputedStyle(el);
  const display = cs.display;
  if (display.includes("grid")) {
    return "grid";
  }
  if (display.includes("flex")) {
    return "flex";
  }
  // Multicol detection: column-count or column-width set to non-auto
  if (cs.columnCount !== "auto" || cs.columnWidth !== "auto") {
    return "multicol";
  }
  return null;
}

/**
 * Enumerate the gap-decoration containers in the document: elements matched by
 * any gap-decoration selector, or carrying inline gap-decoration declarations,
 * that are also gap containers (grid / flex / multicol).
 */
export function collectGapContainers(
  declarations: ParsedDeclaration[],
  root: Document | Element = document,
): Set<Element> {
  const candidates = new Set<Element>();

  for (const decl of declarations) {
    let matched: NodeListOf<Element>;
    try {
      matched = root.querySelectorAll(decl.selector);
    } catch {
      continue; // invalid selector
    }
    for (const el of matched) {
      candidates.add(el);
    }
  }

  for (const el of collectInlineGapElements(root)) {
    candidates.add(el);
  }

  const containers = new Set<Element>();
  for (const el of candidates) {
    if (detectContainerType(el)) {
      containers.add(el);
    }
  }
  return containers;
}
