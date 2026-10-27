/**
 * Segment selection — converts gaps + intersections + styles into
 * drawable segments, applying rule-break, rule-visibility-items,
 * and inset logic.
 *
 * Reference: core/paint/gap_decorations_painter.cc
 */

import type { ContainerType } from "./cascade.js";
import {
  type Gap,
  type GapGeometry,
  type Intersection,
  isBlockReversedWritingMode,
} from "./geometry/common.js";
import type {
  ComputedGapStyles,
  GapDataList,
  InsetValue,
  LineStyle,
  RuleBreak,
  RuleVisibilityItems,
} from "./properties.js";
import {
  expandGapDataList,
  resolveRuleBreak,
  resolveVisibilityItems,
} from "./resolve.js";

export interface Segment {
  /** Start position along the gap's cross axis (px, from container border box). */
  start: number;
  /** End position along the gap's cross axis (px). */
  end: number;
  /** Center of the gap on its own axis (px). */
  center: number;
  /** Axis this segment lies on. */
  axis: "column" | "row";
  /** Decoration width in px. */
  width: number;
  /** Decoration style. */
  style: LineStyle;
  /** Decoration color (CSS color string). */
  color: string;
  /** Gap size in px (for clipping). */
  gapSize: number;
}

/**
 * Generate all drawable segments for a gap container.
 */
export function generateSegments(
  geometry: GapGeometry,
  styles: ComputedGapStyles,
  direction: "ltr" | "rtl" = "ltr",
): Segment[] {
  const containerType = geometry.containerType;
  if (!containerType) {
    return [];
  }

  const segments: Segment[] = [];

  // Process column gaps
  processAxis(
    "column",
    geometry.columnGaps,
    geometry.columnIntersections,
    styles,
    containerType,
    geometry,
    segments,
    direction,
  );

  // Process row gaps
  processAxis(
    "row",
    geometry.rowGaps,
    geometry.rowIntersections,
    styles,
    containerType,
    geometry,
    segments,
    direction,
  );

  return segments;
}

function processAxis(
  axis: "column" | "row",
  gaps: Gap[],
  intersectionsMap: Map<number, Intersection[]>,
  styles: ComputedGapStyles,
  containerType: ContainerType,
  geometry: GapGeometry,
  segments: Segment[],
  direction: "ltr" | "rtl",
): void {
  if (gaps.length === 0) {
    return;
  }

  const prefix = axis === "column" ? "column" : "row";

  // For overlap-join: determine if this axis is the main direction.
  // Per Blink README: multicol main = row (column-wrap rows + spanners),
  // cross = column. Flex main depends on flex-direction. Grid: N/A.
  const isMainAxis =
    containerType === "multicol" ? axis === "row" : containerType === "flex";

  // Expand value lists for this axis
  const gapCount = gaps.length;
  let widths = expandGapDataList<number>(
    styles[
      `${prefix}-rule-width` as keyof ComputedGapStyles
    ] as GapDataList<number>,
    gapCount,
  );
  let stylesList = expandGapDataList<LineStyle>(
    styles[
      `${prefix}-rule-style` as keyof ComputedGapStyles
    ] as GapDataList<LineStyle>,
    gapCount,
  );
  let colors = expandGapDataList<string>(
    styles[
      `${prefix}-rule-color` as keyof ComputedGapStyles
    ] as GapDataList<string>,
    gapCount,
  );

  // In RTL, column-rule value lists index from inline-end (physical right)
  // to inline-start (physical left), so reverse the expanded arrays to match
  // the physical gap ordering (which is always left-to-right).
  //
  // In sideways-lr, inline direction is bottom-to-top, so column-rule
  // values also reverse (physical gaps are top-to-bottom).
  //
  // In vertical-rl / sideways-rl, block direction is right-to-left.
  // For grid, the geometry already arranges row gaps R-to-L, so no reversal.
  // For flex and multicol, cross-axis gaps are always in ascending physical
  // order (L-to-R), so we need to reverse row-rule values.
  const wm = geometry.writingMode || "";
  const isSidewaysLR = wm === "sideways-lr";
  const isBlockRTL = isBlockReversedWritingMode(wm);
  if (direction === "rtl" && axis === "column") {
    widths = [...widths].reverse();
    stylesList = [...stylesList].reverse();
    colors = [...colors].reverse();
  }
  if (isSidewaysLR && axis === "column") {
    widths = [...widths].reverse();
    stylesList = [...stylesList].reverse();
    colors = [...colors].reverse();
  }
  if (
    isBlockRTL &&
    axis === "row" &&
    (containerType === "flex" || containerType === "multicol")
  ) {
    widths = [...widths].reverse();
    stylesList = [...stylesList].reverse();
    colors = [...colors].reverse();
  }

  const ruleBreak = resolveRuleBreak(
    styles[`${prefix}-rule-break` as keyof ComputedGapStyles] as RuleBreak,
    containerType,
    axis,
  );

  const visibilityRaw = styles[
    `${prefix}-rule-visibility-items` as keyof ComputedGapStyles
  ] as RuleVisibilityItems | undefined;
  const visibility = visibilityRaw
    ? resolveVisibilityItems(visibilityRaw, containerType, axis)
    : "all";

  let capStart = styles[
    `${prefix}-rule-inset-cap-start` as keyof ComputedGapStyles
  ] as InsetValue;
  let capEnd = styles[
    `${prefix}-rule-inset-cap-end` as keyof ComputedGapStyles
  ] as InsetValue;
  let juncStart = styles[
    `${prefix}-rule-inset-junction-start` as keyof ComputedGapStyles
  ] as InsetValue;
  let juncEnd = styles[
    `${prefix}-rule-inset-junction-end` as keyof ComputedGapStyles
  ] as InsetValue;

  // Per spec, inset-start/end are logical: "start" is the endpoint nearest
  // the gap's start side. We map them to physical segment start/end (lower/
  // higher coordinate). For row rules the gap's cross axis is the inline
  // axis, so RTL swaps start↔end (handled below). For column rules the cross
  // axis is the block axis; this mapping assumes a top-to-bottom block flow.
  if (direction === "rtl" && axis === "row") {
    [capStart, capEnd] = [capEnd, capStart];
    [juncStart, juncEnd] = [juncEnd, juncStart];
  }

  for (let gi = 0; gi < gaps.length; gi++) {
    const gap = gaps[gi];
    const w = widths[gi] ?? 3;
    const s = stylesList[gi] ?? "none";
    const c = colors[gi] ?? "currentcolor";

    if (s === "none" || s === "hidden" || w <= 0) {
      continue;
    }

    const intersections = intersectionsMap.get(gap.index);
    if (!intersections || intersections.length < 2) {
      continue;
    }

    // Step 1: Build per-track raw segments from intersection endpoints.
    // The list alternates: edge, [cross-end, cross-start]*, edge
    // Segments are: [edge→cross-end], [cross-start→cross-end]*, [cross-start→edge]
    const rawPairs: SelectedPair[] = [];
    let startInt = intersections[0];
    let trackIdx = 0;

    for (let i = 1; i < intersections.length; i++) {
      const int = intersections[i];
      if (int.type === "cross-end" || int.type === "edge") {
        if (int.position > startInt.position) {
          rawPairs.push({ start: startInt, end: int, trackIndex: trackIdx });
        }
        trackIdx++;
        if (i + 1 < intersections.length) {
          startInt = intersections[i + 1];
          i++; // skip the cross-start
        }
      }
    }

    // Step 2: Filter out segments blocked by spanning items (discontiguity)
    // When rule-break is 'none', we skip blocked-range filtering (rules
    // paint through spanning items) but still apply visibility filtering.
    if (ruleBreak === "none") {
      // Apply empty-range + visibility filtering before merging.
      const afterEmpty =
        visibility === "all"
          ? rawPairs
          : rawPairs.filter((pair) =>
              visibility === "around"
                ? !isSegmentFullyEmpty(
                    gap,
                    pair.start.position,
                    pair.end.position,
                  )
                : !isSegmentInEmptyRange(
                    gap,
                    pair.start.position,
                    pair.end.position,
                  ),
            );

      const visiblePairs =
        visibility === "all"
          ? afterEmpty
          : afterEmpty.filter((pair) =>
              isSegmentVisible(
                gap,
                pair,
                pair.trackIndex,
                rawPairs.length,
                visibility,
                geometry,
              ),
            );

      if (visiblePairs.length === 0) {
        continue;
      }

      // Merge all visible pairs into one continuous segment.
      const merged = mergeSegments(visiblePairs, ruleBreak, gap);
      for (const seg of merged) {
        const firstStart = seg.start;
        const lastEnd = seg.end;
        let segStart = firstStart.position;
        let segEnd = lastEnd.position;

        segStart += resolveInset(
          capStart,
          firstStart.crossingGapWidth,
          0,
          "start",
          containerType,
          isMainAxis,
        );
        segEnd -= resolveInset(
          capEnd,
          lastEnd.crossingGapWidth,
          0,
          "end",
          containerType,
          isMainAxis,
        );

        if (segEnd <= segStart) {
          continue;
        }

        segments.push({
          start: segStart,
          end: segEnd,
          center: gap.center,
          axis,
          width: w,
          style: s,
          color: c,
          gapSize: gap.size,
        });
      }
      continue;
    }

    const unblocked = rawPairs.filter(
      (pair) => !isSegmentBlocked(gap, pair.start.position, pair.end.position),
    );

    // Step 2b: Also filter out segments in empty ranges (fewer-columns
    // rows in multicol) — but only when visibility is not "all", since
    // "all" paints rules even where no items exist.
    // For "around" visibility, use fullyEmptyRanges (both sides empty)
    // instead of emptyRanges (after-side empty only).
    const afterEmpty =
      visibility === "all"
        ? unblocked
        : unblocked.filter((pair) =>
            visibility === "around"
              ? !isSegmentFullyEmpty(
                  gap,
                  pair.start.position,
                  pair.end.position,
                )
              : !isSegmentInEmptyRange(
                  gap,
                  pair.start.position,
                  pair.end.position,
                ),
          );

    // Step 3: Filter by visibility-items
    const visible =
      visibility === "all"
        ? afterEmpty
        : afterEmpty.filter((pair) =>
            isSegmentVisible(
              gap,
              pair,
              pair.trackIndex,
              rawPairs.length,
              visibility,
              geometry,
            ),
          );

    // Step 4: Merge per rule-break
    const merged = mergeSegments(visible, ruleBreak, gap);

    // Step 5: Apply insets and emit.
    // For overlap-join, we need to determine whether each endpoint is a
    // "cap" (geometry edge or dangling — no crossing decoration) or a
    // "junction" (crossing decoration is visible). Cap endpoints stay
    // flush; junction endpoints extend to meet the crossing decoration.
    const crossAxis: "column" | "row" = axis === "column" ? "row" : "column";
    const crossPrefix = crossAxis === "column" ? "column" : "row";
    const crossVisibilityRaw = styles[
      `${crossPrefix}-rule-visibility-items` as keyof ComputedGapStyles
    ] as RuleVisibilityItems | undefined;
    const crossVisibility = crossVisibilityRaw
      ? resolveVisibilityItems(crossVisibilityRaw, containerType, crossAxis)
      : "all";

    // Pre-compute cross-axis decoration widths for overlap-join extension
    const crossGaps =
      crossAxis === "column" ? geometry.columnGaps : geometry.rowGaps;
    const crossWidthsList = expandGapDataList<number>(
      styles[
        `${crossPrefix}-rule-width` as keyof ComputedGapStyles
      ] as GapDataList<number>,
      crossGaps.length,
    );

    for (const pair of merged) {
      let segStart = pair.start.position;
      let segEnd = pair.end.position;

      // Determine if each endpoint is a "cap" (edge or dangling)
      const startIsCap = isCapEndpoint(
        pair.start,
        gap,
        crossVisibility,
        geometry,
        visibility,
      );
      const endIsCap = isCapEndpoint(
        pair.end,
        gap,
        crossVisibility,
        geometry,
        visibility,
      );

      const startInset = startIsCap ? capStart : juncStart;
      const endInset = endIsCap ? capEnd : juncEnd;

      // Get cross decoration width at each endpoint for overlap-join
      const startCrossDecWidth = startIsCap
        ? 0
        : getCrossDecorationWidth(pair.start, gap, crossGaps, crossWidthsList);
      const endCrossDecWidth = endIsCap
        ? 0
        : getCrossDecorationWidth(pair.end, gap, crossGaps, crossWidthsList);

      segStart += resolveInset(
        startInset,
        pair.start.crossingGapWidth,
        startCrossDecWidth,
        "start",
        containerType,
        isMainAxis,
      );
      segEnd -= resolveInset(
        endInset,
        pair.end.crossingGapWidth,
        endCrossDecWidth,
        "end",
        containerType,
        isMainAxis,
      );

      if (segEnd <= segStart) {
        continue;
      }

      segments.push({
        start: segStart,
        end: segEnd,
        center: gap.center,
        axis,
        width: w,
        style: s,
        color: c,
        gapSize: gap.size,
      });
    }
  }
}

interface SelectedPair {
  start: Intersection;
  end: Intersection;
  /** Original track index (row or column) this segment corresponds to. */
  trackIndex: number;
}

/**
 * Determine if an intersection endpoint is a "cap" (geometry edge or dangling).
 * Cap endpoints stay flush with overlap-join; junction endpoints extend.
 *
 * Mirrors Blink's IsCapIntersection + HasCrossGapSegment algorithm:
 * 1. Container edge → cap.
 * 2. Same-axis visibility is not "between" → always junction (cross segment
 *    is considered present regardless).
 * 3. Otherwise check the cross-direction gap for a visible, non-blocked
 *    segment on EITHER track flanking this gap. A cross segment is "present"
 *    when it is visible (per cross visibility-items) AND not blocked by a
 *    spanning item at that track position.
 *
 * In flex/multicol, edge endpoints may abut a cross-axis gap (crossingGapWidth > 0).
 * These are junction endpoints for overlap-join purposes.
 */
function isCapEndpoint(
  intersection: Intersection,
  gap: Gap,
  crossVisibility: RuleVisibilityItems,
  geometry: GapGeometry,
  sameVisibility?: RuleVisibilityItems,
): boolean {
  // Geometry edges with no abutting gap are always caps
  if (intersection.type === "edge" && intersection.crossingGapWidth <= 0) {
    return true;
  }
  // No crossing gap → cap
  if (intersection.crossingGapWidth <= 0) {
    return true;
  }

  // For containers without occupancy data, default to junction
  if (!geometry.occupied || !geometry.numRows || !geometry.numCols) {
    return false;
  }

  // Blink: HasCrossGapSegment returns true early (→ junction) when
  // same-axis visibility is not "between". The detailed cross-segment
  // check only applies for grid containers with visibility-items: between.
  const effectiveSameVis = sameVisibility ?? "all";
  if (effectiveSameVis !== "between") {
    return false; // junction
  }

  const { occupied, numRows, numCols } = geometry;

  if (gap.axis === "column") {
    const col = gap.index;
    for (const rg of geometry.rowGaps) {
      const rgStart = rg.center - rg.size / 2;
      const rgEnd = rg.center + rg.size / 2;
      if (
        Math.abs(intersection.position - rgStart) < 1 ||
        Math.abs(intersection.position - rgEnd) < 1
      ) {
        const rowBefore = rg.index;
        const rowAfter = rg.index + 1;
        if (rowBefore < 0 || rowAfter >= numRows) {
          return true;
        }

        // Check cross-direction (row rule) visibility at both tracks
        // flanking this column gap: track col (before) and col+1 (after).
        const beforeVisible =
          crossVisibility === "all" ||
          isTrackVisibleForCross(
            occupied,
            rowBefore,
            rowAfter,
            col,
            crossVisibility,
          );
        const afterVisible =
          col + 1 < numCols &&
          (crossVisibility === "all" ||
            isTrackVisibleForCross(
              occupied,
              rowBefore,
              rowAfter,
              col + 1,
              crossVisibility,
            ));

        // Gate each side on whether a spanning item blocks the cross gap
        // at that track position (mirrors Blink's GetIntersectionBlockedStatus).
        const gapLeft = gap.center - gap.size / 2;
        const gapRight = gap.center + gap.size / 2;
        const beforeBlocked = isCrossGapBlockedAt(rg, gapLeft - 1);
        const afterBlocked = isCrossGapBlockedAt(rg, gapRight + 1);

        const crossPresent =
          (beforeVisible && !beforeBlocked) || (afterVisible && !afterBlocked);
        return !crossPresent;
      }
    }
  } else {
    const row = gap.index;
    for (const cg of geometry.columnGaps) {
      const cgStart = cg.center - cg.size / 2;
      const cgEnd = cg.center + cg.size / 2;
      if (
        Math.abs(intersection.position - cgStart) < 1 ||
        Math.abs(intersection.position - cgEnd) < 1
      ) {
        const colBefore = cg.index;
        const colAfter = cg.index + 1;
        if (colBefore < 0 || colAfter >= numCols) {
          return true;
        }

        // Check cross-direction (column rule) visibility at both tracks
        // flanking this row gap: track row (before) and row+1 (after).
        const beforeVisible =
          crossVisibility === "all" ||
          isTrackVisibleForCrossRow(
            occupied,
            row,
            colBefore,
            colAfter,
            crossVisibility,
          );
        const afterVisible =
          row + 1 < numRows &&
          (crossVisibility === "all" ||
            isTrackVisibleForCrossRow(
              occupied,
              row + 1,
              colBefore,
              colAfter,
              crossVisibility,
            ));

        // Gate on spanning-item blocked status.
        const gapTop = gap.center - gap.size / 2;
        const gapBottom = gap.center + gap.size / 2;
        const beforeBlocked = isCrossGapBlockedAt(cg, gapTop - 1);
        const afterBlocked = isCrossGapBlockedAt(cg, gapBottom + 1);

        const crossPresent =
          (beforeVisible && !beforeBlocked) || (afterVisible && !afterBlocked);
        return !crossPresent;
      }
    }
  }

  return false; // Default: junction (has crossing decoration)
}

/**
 * Check if a row-rule segment at a given column track is visible.
 * The segment flanks a row gap between rowBefore and rowAfter.
 */
function isTrackVisibleForCross(
  occupied: boolean[][],
  rowBefore: number,
  rowAfter: number,
  col: number,
  visibility: RuleVisibilityItems,
): boolean {
  const b = occupied[rowBefore][col];
  const a = occupied[rowAfter][col];
  return visibility === "between" ? b && a : b || a;
}

/**
 * Check if a column-rule segment at a given row track is visible.
 * The segment flanks a column gap between colBefore and colAfter.
 */
function isTrackVisibleForCrossRow(
  occupied: boolean[][],
  row: number,
  colBefore: number,
  colAfter: number,
  visibility: RuleVisibilityItems,
): boolean {
  const b = occupied[row][colBefore];
  const a = occupied[row][colAfter];
  return visibility === "between" ? b && a : b || a;
}

/**
 * Check if a cross gap is blocked by a spanning item at a given physical
 * position along its cross axis.
 */
function isCrossGapBlockedAt(crossGap: Gap, position: number): boolean {
  if (!crossGap.blockedRanges) {
    return false;
  }
  for (const range of crossGap.blockedRanges) {
    if (range.start <= position + 1 && range.end >= position - 1) {
      return true;
    }
  }
  return false;
}

/**
 * Get the width of the cross-direction decoration at an intersection point.
 */
function getCrossDecorationWidth(
  intersection: Intersection,
  _gap: Gap,
  crossGaps: Gap[],
  crossWidths: (number | undefined)[],
): number {
  if (intersection.crossingGapWidth <= 0) {
    return 0;
  }

  // Find which cross-gap this intersection corresponds to
  for (let i = 0; i < crossGaps.length; i++) {
    const cg = crossGaps[i];
    const cgStart = cg.center - cg.size / 2;
    const cgEnd = cg.center + cg.size / 2;
    if (
      Math.abs(intersection.position - cgStart) < 1 ||
      Math.abs(intersection.position - cgEnd) < 1
    ) {
      return crossWidths[i] ?? 3;
    }
  }

  return 0;
}

/**
 * Check if a segment is entirely blocked by a spanning item.
 */
function isSegmentBlocked(
  gap: Gap,
  crossStart: number,
  crossEnd: number,
): boolean {
  if (!gap.blockedRanges) {
    return false;
  }
  for (const range of gap.blockedRanges) {
    // The spanning item covers this segment if it covers the entire segment range
    if (range.start <= crossStart + 1 && range.end >= crossEnd - 1) {
      return true;
    }
  }
  return false;
}

/** Check if a segment falls in an empty range (fewer-columns row in multicol). */
function isSegmentInEmptyRange(
  gap: Gap,
  crossStart: number,
  crossEnd: number,
): boolean {
  if (!gap.emptyRanges) {
    return false;
  }
  for (const range of gap.emptyRanges) {
    if (range.start <= crossStart + 1 && range.end >= crossEnd - 1) {
      return true;
    }
  }
  return false;
}

/** Check if a segment falls in a fully-empty range (both sides empty).
 *  Used for "around" visibility where we only hide when neither column has items. */
function isSegmentFullyEmpty(
  gap: Gap,
  crossStart: number,
  crossEnd: number,
): boolean {
  if (!gap.fullyEmptyRanges) {
    return false;
  }
  for (const range of gap.fullyEmptyRanges) {
    if (range.start <= crossStart + 1 && range.end >= crossEnd - 1) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a per-track segment should be visible based on rule-visibility-items.
 *
 * For grid: the segment is between two adjacent tracks. We check if the
 * cells on both sides of the gap in that track-pair are occupied.
 * `trackIndex` is the index of this segment within the raw per-track list
 * for this gap (0 = first track-pair, etc.).
 */
function isSegmentVisible(
  gap: Gap,
  _pair: SelectedPair,
  segmentTrackIndex: number,
  _totalSegments: number,
  visibility: RuleVisibilityItems,
  geometry: GapGeometry,
): boolean {
  if (visibility === "all") {
    return true;
  }
  if (!geometry.occupied || !geometry.numRows || !geometry.numCols) {
    return true;
  }

  const { occupied, numRows, numCols } = geometry;

  if (gap.axis === "column") {
    // Column gap index gi is between column gi and column gi+1
    const colBefore = gap.index;
    const colAfter = gap.index + 1;
    if (colBefore < 0 || colAfter >= numCols) {
      return true;
    }

    // This segment corresponds to a specific row track
    const row = segmentTrackIndex;
    if (row < 0 || row >= numRows) {
      return true;
    }

    const beforeOcc = occupied[row][colBefore];
    const afterOcc = occupied[row][colAfter];

    if (visibility === "between") {
      return beforeOcc && afterOcc;
    }
    if (visibility === "around") {
      return beforeOcc || afterOcc;
    }
  } else {
    // Row gap index gi is between row gi and row gi+1
    const rowBefore = gap.index;
    const rowAfter = gap.index + 1;
    if (rowBefore < 0 || rowAfter >= numRows) {
      return true;
    }

    // This segment corresponds to a specific column track
    const col = segmentTrackIndex;
    if (col < 0 || col >= numCols) {
      return true;
    }

    const beforeOcc = occupied[rowBefore][col];
    const afterOcc = occupied[rowAfter][col];

    if (visibility === "between") {
      return beforeOcc && afterOcc;
    }
    if (visibility === "around") {
      return beforeOcc || afterOcc;
    }
  }

  return true;
}

/**
 * Merge adjacent segments based on the *resolved* rule-break value.
 *
 * `ruleBreak` here is the value returned by resolveRuleBreak(), which has
 * already mapped the per-spec `normal` keyword to its container-specific
 * behavior (see resolve.ts and css-gaps-1 § 3.2): flex `normal` → none,
 * multicol column `normal` → intersection, multicol row `normal` → none.
 * Grid is the only container whose `normal` stays `normal`, so the `normal`
 * arm below is reached only for grid — not because `normal` is grid-only.
 * - none: merge contiguous segments into continuous lines
 * - intersection: don't merge (keep per-track segments)
 * - normal (grid only): merge adjacent segments unless a spanning item
 *   blocks the junction between them
 */
function mergeSegments(
  pairs: SelectedPair[],
  ruleBreak: RuleBreak,
  gap: Gap,
): SelectedPair[] {
  if (pairs.length === 0) {
    return [];
  }

  if (ruleBreak === "none") {
    // Merge contiguous segments into continuous lines. Non-contiguous
    // visible segments (separated by invisible tracks) stay separate.
    const merged: SelectedPair[] = [];
    let current = pairs[0];
    let currentEndTrackIndex = pairs[0].trackIndex;

    for (let i = 1; i < pairs.length; i++) {
      const next = pairs[i];
      if (next.trackIndex === currentEndTrackIndex + 1) {
        // Contiguous — merge through
        current = {
          start: current.start,
          end: next.end,
          trackIndex: current.trackIndex,
        };
        currentEndTrackIndex = next.trackIndex;
      } else {
        merged.push(current);
        current = next;
        currentEndTrackIndex = next.trackIndex;
      }
    }
    merged.push(current);
    return merged;
  }

  if (ruleBreak === "intersection") {
    return pairs; // keep each per-track segment
  }

  // Resolved `normal` (grid only): merge adjacent pairs unless the junction
  // between them is blocked by a spanning item (the "flanked by spanning
  // items" check).
  const merged: SelectedPair[] = [];
  let current = pairs[0];
  let currentEndTrackIndex = pairs[0].trackIndex;

  for (let i = 1; i < pairs.length; i++) {
    const next = pairs[i];

    // Visibility filtering can remove middle tracks. Never merge across
    // a missing track, even if there is no explicit spanning-item block.
    const contiguousTrack = next.trackIndex === currentEndTrackIndex + 1;

    if (!contiguousTrack) {
      merged.push(current);
      current = next;
      currentEndTrackIndex = next.trackIndex;
      continue;
    }

    // The junction is the gap between current.end and next.start
    const junctionMid = (current.end.position + next.start.position) / 2;
    const blocked = isJunctionBlocked(gap, junctionMid);

    if (blocked) {
      merged.push(current);
      current = next;
      currentEndTrackIndex = next.trackIndex;
    } else {
      // Merge through the junction
      current = {
        start: current.start,
        end: next.end,
        trackIndex: current.trackIndex,
      };
      currentEndTrackIndex = next.trackIndex;
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Check if a gap junction (at a cross-gap boundary) is blocked by a spanning item.
 */
function isJunctionBlocked(gap: Gap, crossPosition: number): boolean {
  if (!gap.blockedRanges) {
    return false;
  }
  for (const range of gap.blockedRanges) {
    if (range.start <= crossPosition && range.end >= crossPosition) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve an inset value to a px offset.
 *
 * @param crossingGapWidth - Width of the cross-direction gap at this endpoint
 * @param crossDecorationWidth - Width of the cross-direction decoration at this endpoint
 * @param containerType - Container type (affects overlap-join formula)
 * @param isMainAxis - Whether the current gap is on the main axis (flex/multicol only)
 */
function resolveInset(
  inset: InsetValue | undefined,
  crossingGapWidth: number,
  crossDecorationWidth: number,
  _direction: "start" | "end",
  containerType?: ContainerType,
  isMainAxis?: boolean,
): number {
  if (!inset) {
    return 0;
  }

  if (inset.type === "keyword") {
    // The only keyword currently defined is overlap-join, which extends
    // to meet the crossing decoration.
    // If crossDecorationWidth is 0, this is a cap (no crossing decoration) → flush.
    if (crossDecorationWidth > 0 && crossingGapWidth > 0) {
      // Per Blink: for flex and multicol MAIN-direction gaps, main gaps
      // don't overlap with the cross gap — extend by half cross gap only.
      // For cross-direction gaps (and grid), extend by half cross gap
      // PLUS half cross decoration width.
      if (
        isMainAxis &&
        (containerType === "flex" || containerType === "multicol")
      ) {
        return -(crossingGapWidth / 2);
      }
      return -(crossingGapWidth / 2 + crossDecorationWidth / 2);
    }
    return 0;
  }

  if (inset.type === "percentage") {
    return (inset.value / 100) * crossingGapWidth;
  }

  return inset.value; // px
}
