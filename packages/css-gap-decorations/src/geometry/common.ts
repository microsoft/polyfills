/**
 * Common types and shared helpers for the geometry engine.
 */

import type { ContainerType } from "../cascade.js";

export interface Gap {
  axis: "column" | "row";
  /** Center position along the gap's own axis (px, relative to container border box). */
  center: number;
  /** Cross-axis start (px, relative to container border box). */
  crossStart: number;
  /** Cross-axis end (px, relative to container border box). */
  crossEnd: number;
  /** Gap size in px. */
  size: number;
  /** Index of this gap (0-based, among gaps on the same axis). */
  index: number;
  /** Ranges where spanning items block this gap. */
  blockedRanges?: { start: number; end: number }[];
  /** Ranges where no items occupy the adjacent cells (fewer-columns rows).
   *  These are only blocked when rule-visibility-items is not 'all'. */
  emptyRanges?: { start: number; end: number }[];
  /** Ranges where BOTH adjacent columns are empty (for 'around' visibility).
   *  'around' shows rules when at least one side has items. */
  fullyEmptyRanges?: { start: number; end: number }[];
  /** For flex: which flex line items are adjacent to this gap. */
  adjacentItems?: { before: Element | null; after: Element | null };
  /** For flex: which flex line this column gap belongs to. */
  lineIndex?: number;
}

export interface Intersection {
  /** Position along the gap's cross axis (px). */
  position: number;
  /** Type of intersection endpoint. */
  type: "edge" | "cross-start" | "cross-end";
  /** Width of the crossing gap at this intersection. */
  crossingGapWidth: number;
}

export interface GapGeometry {
  containerType: ContainerType;
  containerRect: DOMRect;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  contentHeight: number;
  columnGaps: Gap[];
  rowGaps: Gap[];
  columnIntersections: Map<number, Intersection[]>;
  rowIntersections: Map<number, Intersection[]>;
  columnGapSize: number;
  rowGapSize: number;
  /** Grid cell occupancy for visibility-items. occupied[row][col]. */
  occupied?: boolean[][];
  numRows?: number;
  numCols?: number;
  /** True when the container uses a vertical writing mode. */
  isVertical?: boolean;
  /** The container's writing-mode value (for multi-value cycling direction). */
  writingMode?: string;
}

// ---- Shared helpers ----

export interface ContentBox {
  cs: CSSStyleDeclaration;
  rect: DOMRect;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  contentHeight: number;
}

/** Compute the content box dimensions for an element. */
export function getContentBox(el: Element): ContentBox {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;
  const paddingRight = parseFloat(cs.paddingRight) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderLeft = parseFloat(cs.borderLeftWidth) || 0;

  return {
    cs,
    rect,
    contentLeft: borderLeft + paddingLeft,
    contentTop: borderTop + paddingTop,
    contentWidth:
      rect.width -
      borderLeft -
      (parseFloat(cs.borderRightWidth) || 0) -
      paddingLeft -
      paddingRight,
    contentHeight:
      rect.height -
      borderTop -
      (parseFloat(cs.borderBottomWidth) || 0) -
      paddingTop -
      paddingBottom,
  };
}

/** Check if a CSS writing-mode value is vertical. */
export function isVerticalWritingMode(wm: string): boolean {
  return (
    wm === "vertical-rl" ||
    wm === "vertical-lr" ||
    wm === "sideways-rl" ||
    wm === "sideways-lr"
  );
}

/**
 * Check if a CSS writing-mode value has a block axis that progresses in the
 * negative physical direction (right-to-left). These are the vertical modes
 * whose columns/rows of column boxes are laid out from the right edge: the
 * geometry and segment code must reverse block-axis ordering for them.
 */
export function isBlockReversedWritingMode(wm: string): boolean {
  return wm === "vertical-rl" || wm === "sideways-rl";
}

/**
 * Read a CSS property from a `CSSStyleDeclaration` that may not be in
 * TypeScript's type definitions (e.g. Chromium-specific properties like
 * `columnHeight` or `columnWrap`).  Returns the empty string when the
 * property is missing or the browser doesn't support it.
 */
export function getCSSProperty(cs: CSSStyleDeclaration, prop: string): string {
  return ((cs as unknown as Record<string, unknown>)[prop] as string) ?? "";
}

/**
 * Compute intersection lists for a set of gaps against their crossing gaps.
 * Each gap gets edge endpoints at crossStart/crossEnd, plus cross-end/cross-start
 * pairs for each crossing gap that falls within its range.
 *
 * When `useBlockedRanges` is true (default), gaps with `blockedRanges` get
 * additional intersection points at blocked boundaries (used by multicol for
 * spanner-interrupted column gaps). Grid gaps have blockedRanges for spanning
 * items but use them for visibility filtering only, not intersection breaking.
 *
 * The intersection list is sorted by position, with stable ordering:
 * edge < cross-end < cross-start at the same position.
 */
export function computeCrossIntersections(
  gaps: Gap[],
  crossGaps: Gap[],
  useBlockedRanges = false,
): Map<number, Intersection[]> {
  const result = new Map<number, Intersection[]>();

  for (const gap of gaps) {
    const intersections: Intersection[] = [
      { position: gap.crossStart, type: "edge", crossingGapWidth: 0 },
    ];

    // Add blocked-range intersection points (spanner boundaries)
    if (useBlockedRanges && gap.blockedRanges) {
      for (const range of gap.blockedRanges) {
        intersections.push({
          position: range.start,
          type: "cross-end",
          crossingGapWidth: 0,
        });
        intersections.push({
          position: range.end,
          type: "cross-start",
          crossingGapWidth: 0,
        });
      }
    }

    // Add crossing-gap intersection pairs
    for (const cg of crossGaps) {
      const cgStart = cg.center - cg.size / 2;
      const cgEnd = cg.center + cg.size / 2;
      if (cgStart > gap.crossStart && cgEnd < gap.crossEnd) {
        intersections.push({
          position: cgStart,
          type: "cross-end",
          crossingGapWidth: cg.size,
        });
        intersections.push({
          position: cgEnd,
          type: "cross-start",
          crossingGapWidth: cg.size,
        });
      }
    }

    intersections.push({
      position: gap.crossEnd,
      type: "edge",
      crossingGapWidth: 0,
    });

    // Stable sort: at the same position, cross-end must come before
    // cross-start so the pair-building algorithm pairs them correctly.
    const typeOrder = { edge: 0, "cross-end": 1, "cross-start": 2 };
    intersections.sort(
      (a, b) =>
        a.position - b.position ||
        (typeOrder[a.type] ?? 0) - (typeOrder[b.type] ?? 0),
    );
    result.set(gap.index, intersections);
  }

  return result;
}
