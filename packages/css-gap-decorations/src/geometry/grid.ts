/**
 * Grid geometry — derive gap positions and intersections from a grid container.
 *
 * All coordinates are relative to the container's border box origin,
 * matching the painter's overlay coordinate space.
 *
 * Reference: core/layout/gap/gap_geometry.cc, core/layout/gap/README.md
 */

import {
  computeCrossIntersections,
  type Gap,
  type GapGeometry,
  getContentBox,
  isBlockReversedWritingMode,
  isVerticalWritingMode,
} from "./common.js";

export function computeGridGeometry(el: Element): GapGeometry {
  const { cs, rect, contentLeft, contentTop, contentWidth, contentHeight } =
    getContentBox(el);

  // Detect subgrid on each axis
  const isSubgridCols = cs.gridTemplateColumns.startsWith("subgrid");
  const isSubgridRows = cs.gridTemplateRows.startsWith("subgrid");

  let columnGap: number;
  let rowGap: number;
  let colTracks: number[];
  let rowTracks: number[];

  if (isSubgridCols || isSubgridRows) {
    const resolved = resolveSubgridTracks(
      el,
      cs,
      rect,
      contentLeft,
      contentTop,
      isSubgridCols,
      isSubgridRows,
    );
    colTracks = resolved.colTracks;
    rowTracks = resolved.rowTracks;
    columnGap = resolved.columnGap;
    rowGap = resolved.rowGap;
  } else {
    columnGap = parseFloat(cs.columnGap) || 0;
    rowGap = parseFloat(cs.rowGap) || 0;
    colTracks = parseTrackList(cs.gridTemplateColumns);
    rowTracks = parseTrackList(cs.gridTemplateRows);
  }

  // Detect writing mode — in vertical modes, inline (columns) runs vertically
  // and block (rows) runs horizontally.
  const wm = cs.writingMode;
  const isVertical = isVerticalWritingMode(wm);

  // Build row/col boundary arrays for track-hit-testing children.
  // In horizontal mode columns run along X, rows along Y.
  // In vertical mode columns run along Y, rows along X.
  const colStarts: number[] = [];
  const colEnds: number[] = [];
  const rowStarts: number[] = [];
  const rowEnds: number[] = [];

  if (!isVertical) {
    let cx = contentLeft;
    for (let i = 0; i < colTracks.length; i++) {
      colStarts.push(cx);
      cx += colTracks[i];
      colEnds.push(cx);
      if (i < colTracks.length - 1) {
        cx += columnGap;
      }
    }
    let ry = contentTop;
    for (let i = 0; i < rowTracks.length; i++) {
      rowStarts.push(ry);
      ry += rowTracks[i];
      rowEnds.push(ry);
      if (i < rowTracks.length - 1) {
        ry += rowGap;
      }
    }
  } else {
    // Vertical writing mode: columns (inline) along Y, rows (block) along X.
    let cy = contentTop;
    for (let i = 0; i < colTracks.length; i++) {
      colStarts.push(cy);
      cy += colTracks[i];
      colEnds.push(cy);
      if (i < colTracks.length - 1) {
        cy += columnGap;
      }
    }
    // For vertical-rl, block direction is right-to-left.
    if (isBlockReversedWritingMode(wm)) {
      let rx = contentLeft + contentWidth;
      for (let i = 0; i < rowTracks.length; i++) {
        rx -= rowTracks[i];
        rowStarts.push(rx);
        rowEnds.push(rx + rowTracks[i]);
        if (i < rowTracks.length - 1) {
          rx -= rowGap;
        }
      }
    } else {
      // vertical-lr / sideways-lr: block direction left-to-right
      let rx = contentLeft;
      for (let i = 0; i < rowTracks.length; i++) {
        rowStarts.push(rx);
        rx += rowTracks[i];
        rowEnds.push(rx);
        if (i < rowTracks.length - 1) {
          rx += rowGap;
        }
      }
    }
  }

  // Compute actual track area extents
  const trackAreaRight = !isVertical
    ? colEnds.length > 0
      ? colEnds[colEnds.length - 1]
      : contentLeft + contentWidth
    : rowEnds.length > 0
      ? Math.max(...rowEnds)
      : contentLeft + contentWidth;
  const trackAreaBottom = !isVertical
    ? rowEnds.length > 0
      ? rowEnds[rowEnds.length - 1]
      : contentTop + contentHeight
    : colEnds.length > 0
      ? colEnds[colEnds.length - 1]
      : contentTop + contentHeight;
  const trackAreaLeft =
    isVertical && rowStarts.length > 0 ? Math.min(...rowStarts) : contentLeft;
  const trackAreaTop =
    isVertical && colStarts.length > 0 ? colStarts[0] : contentTop;

  const columnGaps: Gap[] = [];
  const rowGaps: Gap[] = [];

  // When a grid has both zero-sized and non-zero-sized tracks (auto-fit/
  // auto-fill with collapsed empty tracks), skip gap decorations between
  // collapsed tracks. If ALL tracks are 0px (intentionally sized), keep gaps.
  const hasNonZeroCol = colTracks.some((t) => t > 0);
  const hasNonZeroRow = rowTracks.some((t) => t > 0);

  if (!isVertical) {
    // Horizontal: column gaps along X, cross spans Y
    buildGapsAlongAxis(
      colTracks,
      columnGap,
      contentLeft,
      1,
      hasNonZeroCol,
      "column",
      contentTop,
      trackAreaBottom,
      columnGaps,
    );
    buildGapsAlongAxis(
      rowTracks,
      rowGap,
      contentTop,
      1,
      hasNonZeroRow,
      "row",
      contentLeft,
      trackAreaRight,
      rowGaps,
    );
  } else {
    // Vertical: column gaps along Y, cross spans X
    buildGapsAlongAxis(
      colTracks,
      columnGap,
      contentTop,
      1,
      hasNonZeroCol,
      "column",
      trackAreaLeft,
      trackAreaRight,
      columnGaps,
    );
    // Row gaps along X, cross spans Y
    if (isBlockReversedWritingMode(wm)) {
      buildGapsAlongAxis(
        rowTracks,
        rowGap,
        contentLeft + contentWidth,
        -1,
        hasNonZeroRow,
        "row",
        trackAreaTop,
        trackAreaBottom,
        rowGaps,
      );
    } else {
      buildGapsAlongAxis(
        rowTracks,
        rowGap,
        contentLeft,
        1,
        hasNonZeroRow,
        "row",
        trackAreaTop,
        trackAreaBottom,
        rowGaps,
      );
    }
  }

  // Occupancy grid
  const numRows = rowTracks.length || 1;
  const numCols = colTracks.length || 1;
  const occupied: boolean[][] = Array.from({ length: numRows }, () =>
    Array(numCols).fill(false),
  );

  // Detect children: find which tracks they span using bounding rects.
  // In grid layout, even absolutely-positioned children participate in
  // grid placement and occupy cells. The painter's overlay lives in the
  // container's shadow root, not its light-DOM child list, so it never
  // appears here and needs no filtering.
  // Cache getComputedStyle per child to avoid redundant style resolution.
  const childStyles = new Map<Element, CSSStyleDeclaration>();
  const children = Array.from(el.children).filter((c) => {
    const ccs = getComputedStyle(c);
    if (ccs.display === "none") {
      return false;
    }
    childStyles.set(c, ccs);
    return true;
  });

  for (const child of children) {
    const cr = child.getBoundingClientRect();
    const cLeft = cr.left - rect.left;
    const cRight = cr.right - rect.left;
    const cTop = cr.top - rect.top;
    const cBottom = cr.bottom - rect.top;

    let c0: number;
    let c1: number;
    let r0: number;
    let r1: number;

    // Use CSS grid placement (resolved 1-based line numbers) when the
    // gap size is 0 — bounding-rect hit-testing is ambiguous because
    // adjacent tracks share the same boundary.
    const useGridPlacement = columnGap === 0 || rowGap === 0;
    const ccs = childStyles.get(child) ?? getComputedStyle(child);
    const gridColStart = useGridPlacement
      ? parseInt(ccs.gridColumnStart, 10)
      : NaN;
    const gridColEnd = useGridPlacement ? parseInt(ccs.gridColumnEnd, 10) : NaN;
    const gridRowStart = useGridPlacement
      ? parseInt(ccs.gridRowStart, 10)
      : NaN;
    const gridRowEnd = useGridPlacement ? parseInt(ccs.gridRowEnd, 10) : NaN;

    if (
      !Number.isNaN(gridColStart) &&
      !Number.isNaN(gridColEnd) &&
      !Number.isNaN(gridRowStart) &&
      !Number.isNaN(gridRowEnd)
    ) {
      c0 = gridColStart - 1;
      c1 = gridColEnd - 1;
      r0 = gridRowStart - 1;
      r1 = gridRowEnd - 1;
    } else {
      // In vertical writing mode, column tracks run along Y and row tracks
      // along X. Map the child's physical coordinates to the correct axis.
      // For vertical-rl/sideways-rl, row tracks are in descending X order,
      // so we use hitTrackDesc for the row axis.
      if (!isVertical) {
        c0 = hitTrack(cLeft, colStarts, colEnds);
        c1 = hitTrackEnd(cRight, colStarts, colEnds);
        r0 = hitTrack(cTop, rowStarts, rowEnds);
        r1 = hitTrackEnd(cBottom, rowStarts, rowEnds);
      } else {
        c0 = hitTrack(cTop, colStarts, colEnds);
        c1 = hitTrackEnd(cBottom, colStarts, colEnds);
        const rowDesc = isBlockReversedWritingMode(wm);
        if (rowDesc) {
          r0 = hitTrackDesc(cLeft, rowStarts, rowEnds);
          r1 = hitTrackEndDesc(cRight, rowStarts, rowEnds);
        } else {
          r0 = hitTrack(cLeft, rowStarts, rowEnds);
          r1 = hitTrackEnd(cRight, rowStarts, rowEnds);
        }
      }
    }

    // Mark occupancy
    for (let rr = r0; rr < r1 && rr < numRows; rr++) {
      for (let cc = c0; cc < c1 && cc < numCols; cc++) {
        if (rr >= 0 && cc >= 0) {
          occupied[rr][cc] = true;
        }
      }
    }

    // Block column gaps that this item spans across.
    // Column gap cross axis: Y in horizontal mode, X in vertical mode.
    const colBlockStart = isVertical ? cLeft : cTop;
    const colBlockEnd = isVertical ? cRight : cBottom;
    if (c1 - c0 > 1) {
      for (let g = c0; g < c1 - 1 && g < columnGaps.length; g++) {
        if (g >= 0) {
          if (!columnGaps[g].blockedRanges) {
            columnGaps[g].blockedRanges = [];
          }
          columnGaps[g].blockedRanges?.push({
            start: colBlockStart,
            end: colBlockEnd,
          });
        }
      }
    }
    // Row gap cross axis: X in horizontal mode, Y in vertical mode.
    const rowBlockStart = isVertical ? cTop : cLeft;
    const rowBlockEnd = isVertical ? cBottom : cRight;
    if (r1 - r0 > 1) {
      for (let g = r0; g < r1 - 1 && g < rowGaps.length; g++) {
        if (g >= 0) {
          if (!rowGaps[g].blockedRanges) {
            rowGaps[g].blockedRanges = [];
          }
          rowGaps[g].blockedRanges?.push({
            start: rowBlockStart,
            end: rowBlockEnd,
          });
        }
      }
    }
  }

  // Compute intersections
  const colIntersections = computeCrossIntersections(columnGaps, rowGaps);
  const rowIntersections = computeCrossIntersections(rowGaps, columnGaps);

  return {
    containerType: "grid",
    containerRect: rect,
    contentLeft,
    contentTop,
    contentWidth,
    contentHeight,
    columnGaps,
    rowGaps,
    columnIntersections: colIntersections,
    rowIntersections: rowIntersections,
    columnGapSize: columnGap,
    rowGapSize: rowGap,
    occupied,
    numRows,
    numCols,
    isVertical,
    writingMode: wm,
  };
}

/**
 * Resolve track sizes and gap values for a subgrid element by reading
 * the parent grid's resolved tracks and extracting the subset that the
 * subgrid spans. For a subgridded axis the gap size is taken from the
 * parent grid; for a non-subgridded axis the element's own values apply.
 */
function resolveSubgridTracks(
  el: Element,
  cs: CSSStyleDeclaration,
  rect: DOMRect,
  _contentLeft: number,
  _contentTop: number,
  isSubgridCols: boolean,
  isSubgridRows: boolean,
): {
  colTracks: number[];
  rowTracks: number[];
  columnGap: number;
  rowGap: number;
} {
  const parent = el.parentElement;
  if (!parent) {
    return {
      colTracks: [],
      rowTracks: [],
      columnGap: parseFloat(cs.columnGap) || 0,
      rowGap: parseFloat(cs.rowGap) || 0,
    };
  }

  const parentCS = getComputedStyle(parent);
  const parentRect = parent.getBoundingClientRect();
  const parentBorderLeft = parseFloat(parentCS.borderLeftWidth) || 0;
  const parentPaddingLeft = parseFloat(parentCS.paddingLeft) || 0;
  const parentContentLeft = parentBorderLeft + parentPaddingLeft;
  const parentBorderTop = parseFloat(parentCS.borderTopWidth) || 0;
  const parentPaddingTop = parseFloat(parentCS.paddingTop) || 0;
  const parentContentTop = parentBorderTop + parentPaddingTop;

  // Subgrid's position within the parent's border-box
  const offsetX = rect.left - parentRect.left;
  const offsetY = rect.top - parentRect.top;

  let colTracks: number[];
  let columnGap: number;
  if (isSubgridCols) {
    const parentColTracks = parseTrackList(parentCS.gridTemplateColumns);
    const parentColGap = parseFloat(parentCS.columnGap) || 0;
    colTracks = extractSpannedTracks(
      parentColTracks,
      parentColGap,
      parentContentLeft,
      offsetX,
      offsetX + rect.width,
    );
    columnGap = parentColGap;
  } else {
    colTracks = parseTrackList(cs.gridTemplateColumns);
    columnGap = parseFloat(cs.columnGap) || 0;
  }

  let rowTracks: number[];
  let rowGap: number;
  if (isSubgridRows) {
    const parentRowTracks = parseTrackList(parentCS.gridTemplateRows);
    const parentRowGap = parseFloat(parentCS.rowGap) || 0;
    rowTracks = extractSpannedTracks(
      parentRowTracks,
      parentRowGap,
      parentContentTop,
      offsetY,
      offsetY + rect.height,
    );
    rowGap = parentRowGap;
  } else {
    rowTracks = parseTrackList(cs.gridTemplateRows);
    rowGap = parseFloat(cs.rowGap) || 0;
  }

  return { colTracks, rowTracks, columnGap, rowGap };
}

/**
 * Given a parent grid's track sizes, gap, and content-start offset,
 * determine which tracks fall within [spanStart, spanEnd] (both in
 * parent border-box coordinates) and return their sizes.
 */
function extractSpannedTracks(
  parentTracks: number[],
  parentGap: number,
  parentContentStart: number,
  spanStart: number,
  spanEnd: number,
): number[] {
  // Build parent track start/end positions
  const starts: number[] = [];
  const ends: number[] = [];
  let pos = parentContentStart;
  for (let i = 0; i < parentTracks.length; i++) {
    starts.push(pos);
    pos += parentTracks[i];
    ends.push(pos);
    if (i < parentTracks.length - 1) {
      pos += parentGap;
    }
  }

  // Find the first track whose start is at or near spanStart
  let first = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] >= spanStart - 1) {
      first = i;
      break;
    }
    first = i;
  }

  // Find the last track whose end is at or near spanEnd
  let last = parentTracks.length - 1;
  for (let i = parentTracks.length - 1; i >= 0; i--) {
    if (ends[i] <= spanEnd + 1) {
      last = i;
      break;
    }
    last = i;
  }

  return parentTracks.slice(first, last + 1);
}

/** Find which track index a start position falls into. */
function hitTrack(pos: number, starts: number[], ends: number[]): number {
  for (let i = 0; i < starts.length; i++) {
    // Use tight tolerance (0.5px) to avoid zero-gap boundary ambiguity
    // where adjacent tracks share the same boundary.
    if (pos < ends[i] - 0.5) {
      return i;
    }
  }
  return Math.max(0, starts.length - 1);
}

/** Find the exclusive end track for a position. */
function hitTrackEnd(pos: number, starts: number[], _ends: number[]): number {
  for (let i = starts.length - 1; i >= 0; i--) {
    // Use tight tolerance (0.5px) to avoid zero-gap boundary ambiguity
    // where an item edge exactly at a track start is incorrectly counted
    // as spanning into the next track.
    if (pos > starts[i] + 0.5) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * hitTrack for descending-order tracks (vertical-rl row positions go R→L).
 * Tracks are stored [rightmost, ..., leftmost], so starts[0] > starts[1].
 * A position falls into track i if starts[i] <= pos < ends[i].
 */
function hitTrackDesc(pos: number, starts: number[], ends: number[]): number {
  for (let i = 0; i < starts.length; i++) {
    if (pos >= starts[i] - 1 && pos < ends[i] + 1) {
      return i;
    }
  }
  return Math.max(0, starts.length - 1);
}

/** hitTrackEnd for descending-order tracks. */
function hitTrackEndDesc(
  pos: number,
  starts: number[],
  ends: number[],
): number {
  for (let i = starts.length - 1; i >= 0; i--) {
    if (pos <= ends[i] + 1) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Walk a track list and emit Gap objects for non-collapsed gutters.
 *
 * @param tracks       - Resolved track sizes (px).
 * @param gapSize      - CSS gap size (px).
 * @param startPos     - Starting coordinate along the gap's own axis.
 * @param direction    - +1 for ascending, -1 for descending (vertical-rl).
 * @param hasNonZero   - Whether any track in this axis is > 0px.
 * @param axis         - "column" or "row".
 * @param crossStart   - Cross-axis start for every emitted gap.
 * @param crossEnd     - Cross-axis end for every emitted gap.
 * @param out          - Array to push Gap objects into.
 */
function buildGapsAlongAxis(
  tracks: number[],
  gapSize: number,
  startPos: number,
  direction: 1 | -1,
  hasNonZero: boolean,
  axis: "column" | "row",
  crossStart: number,
  crossEnd: number,
  out: Gap[],
): void {
  let pos = startPos;
  let gapIndex = 0;
  let seenNonZero = false;
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i] > 0) {
      seenNonZero = true;
    }
    pos += direction * tracks[i];
    if (i < tracks.length - 1) {
      // Skip gaps that lead into a collapsed (0px) track, and gaps
      // exiting a collapsed region when no non-zero track preceded it.
      const skipCollapsed =
        hasNonZero &&
        (tracks[i + 1] === 0 || (tracks[i] === 0 && !seenNonZero));
      if (!skipCollapsed) {
        out.push({
          axis,
          center: pos + (direction * gapSize) / 2,
          crossStart,
          crossEnd,
          size: gapSize,
          index: gapIndex++,
        });
        pos += direction * gapSize;
      }
    }
  }
}

function parseTrackList(value: string): number[] {
  if (!value || value === "none") {
    return [];
  }
  return value
    .split(/\s+/)
    .map((s) => parseFloat(s))
    .filter((n) => !Number.isNaN(n));
}
