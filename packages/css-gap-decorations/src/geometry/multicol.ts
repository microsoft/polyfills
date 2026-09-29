/**
 * Multicol geometry — derive gap positions from a multi-column container.
 */

import {
  computeCrossIntersections,
  type Gap,
  type GapGeometry,
  getContentBox,
  getCSSProperty,
  isBlockReversedWritingMode,
  isVerticalWritingMode,
} from "./common.js";

export function computeMulticolGeometry(el: Element): GapGeometry {
  const { cs, rect, contentLeft, contentTop, contentWidth, contentHeight } =
    getContentBox(el);

  // Detect writing mode early — controls all axis decisions below.
  const wm = cs.writingMode;
  const isVertical = isVerticalWritingMode(wm);

  const columnGap = parseFloat(cs.columnGap) || 0;
  const rowGap = parseFloat(cs.rowGap) || 0;

  // In vertical writing modes, the inline axis (columns) runs along Y
  // and the block axis (wrapping rows) runs along X.
  const inlineSize = isVertical ? contentHeight : contentWidth;
  const blockSize = isVertical ? contentWidth : contentHeight;
  // Inline-start position (column iteration start)
  const inlineStart = isVertical ? contentTop : contentLeft;
  // Cross-axis extent for column gaps
  const colCrossStart = isVertical ? contentLeft : contentTop;
  const colCrossEnd = isVertical
    ? contentLeft + contentWidth
    : contentTop + contentHeight;
  // Cross-axis extent for row gaps
  const rowCrossStart = isVertical ? contentTop : contentLeft;
  const rowCrossEnd = isVertical
    ? contentTop + contentHeight
    : contentLeft + contentWidth;

  // Determine column count. The browser resolves column-count for us,
  // but when only column-width is specified, columnCount may be 'auto'.
  // In that case, derive the count from column-width and available space,
  // then refine by probing the actual layout to find the real used count.
  let columnCount = parseInt(cs.columnCount, 10);
  const columnCountIsAuto = Number.isNaN(columnCount) || columnCount < 1;
  // maxFormulaColumns: the geometric max from column-width, used later
  // to compute the per-column width when column-count was auto.
  let maxFormulaColumns = columnCount;
  if (columnCountIsAuto) {
    const colWidth = parseFloat(cs.columnWidth);
    if (!Number.isNaN(colWidth) && colWidth > 0 && inlineSize > 0) {
      columnCount = Math.max(
        1,
        Math.floor((inlineSize + columnGap) / (colWidth + columnGap)),
      );
    } else {
      columnCount = 1;
    }
    maxFormulaColumns = columnCount;
  }

  // When column-count was auto, the geometric formula above gives the
  // MAXIMUM columns that fit, but the browser may use fewer based on
  // content. Detect the actual count by inserting probe elements and
  // measuring the real column stride the browser uses.
  let measuredColWidth = 0;
  if (columnCountIsAuto && columnCount > 1) {
    const cssColWidth = parseFloat(cs.columnWidth) || 0;
    if (cssColWidth > 0) {
      const stride = cssColWidth + columnGap;
      // Insert two probes: one at the start and one at the end of
      // the multicol content. Their inline positions reveal the
      // actual column stride the browser is using. The probes are
      // removed in a `finally` so they never linger in the DOM (and
      // can't perturb layout or a subsequent MutationObserver pass)
      // even if a measurement throws.
      const probeStart = document.createElement("div");
      const probeEnd = document.createElement("div");
      const probeCSS =
        "height:0;width:0;margin:0;padding:0;border:0;visibility:hidden;";
      probeStart.setAttribute("data-gap-decorations-polyfill", "");
      probeEnd.setAttribute("data-gap-decorations-polyfill", "");
      probeStart.style.cssText = probeCSS;
      probeEnd.style.cssText = probeCSS;
      let startInline: number;
      let endInline: number;
      try {
        el.prepend(probeStart);
        el.appendChild(probeEnd);
        const startRect = probeStart.getBoundingClientRect();
        const endRect = probeEnd.getBoundingClientRect();
        startInline = isVertical
          ? startRect.top - rect.top
          : startRect.left - rect.left;
        endInline = isVertical
          ? endRect.top - rect.top
          : endRect.left - rect.left;
      } finally {
        probeStart.remove();
        probeEnd.remove();
      }

      // Also check non-spanner children's positions.
      const nonSpannerKids = Array.from(el.children).filter((c) => {
        if (c.hasAttribute("data-gap-decorations-polyfill")) {
          return false;
        }
        const ccs = getComputedStyle(c);
        return ccs.columnSpan !== "all" && ccs.display !== "none";
      });
      let maxInlinePos = endInline;
      for (const c of nonSpannerKids) {
        const r = c.getBoundingClientRect();
        const pos = isVertical ? r.bottom - rect.top : r.right - rect.left;
        if (pos > maxInlinePos) {
          maxInlinePos = pos;
        }
      }

      if (maxInlinePos > startInline) {
        const detectedCols = Math.max(
          1,
          Math.ceil((maxInlinePos - inlineStart + 1) / stride),
        );
        columnCount = Math.min(columnCount, detectedCols);

        // If probes span multiple columns, compute the actual stride.
        const probeColDiff = Math.round((endInline - startInline) / stride);
        if (probeColDiff >= 1) {
          const actualStride = (endInline - startInline) / probeColDiff;
          measuredColWidth = actualStride - columnGap;
        }
      }
    }
  }

  // Compute column positions from column-count and column-gap.
  // When column-count was auto, prefer the measured column width from
  // probes (matches browser's actual layout) over the formula-based value.
  const totalGapWidth = columnGap * Math.max(0, columnCount - 1);
  const columnWidth =
    measuredColWidth > 0
      ? measuredColWidth
      : columnCountIsAuto
        ? (inlineSize + columnGap) / maxFormulaColumns - columnGap
        : (inlineSize - totalGapWidth) / columnCount;

  const columnGaps: Gap[] = [];
  const rowGaps: Gap[] = [];

  // Column gaps walk along the inline axis (X in horizontal, Y in vertical).
  let pos = inlineStart;
  let gapIndex = 0;
  for (let i = 0; i < columnCount; i++) {
    pos += columnWidth;
    if (i < columnCount - 1) {
      columnGaps.push({
        axis: "column",
        center: pos + columnGap / 2,
        crossStart: colCrossStart,
        crossEnd: colCrossEnd,
        size: columnGap,
        index: gapIndex++,
      });
      pos += columnGap;
    }
  }

  // Detect row gaps for multi-row multicol (column-wrap: wrap).
  // Build caches for getComputedStyle and getBoundingClientRect upfront
  // to avoid redundant layout-forcing calls across multiple passes.
  const allChildren = Array.from(el.children).filter(
    (c) => !c.hasAttribute("data-gap-decorations-polyfill"),
  );
  const childCsCache = new Map<Element, CSSStyleDeclaration>();
  const childRectCache = new Map<Element, DOMRect>();
  for (const c of allChildren) {
    childCsCache.set(c, getComputedStyle(c));
    childRectCache.set(c, c.getBoundingClientRect());
  }

  const children = allChildren.filter((c) => {
    const ccs = childCsCache.get(c) ?? getComputedStyle(c);
    return ccs.columnSpan !== "all" && ccs.display !== "none";
  });

  // Collect spanner positions so we can split children into independent
  // content blocks. Row detection must happen within each block — the
  // spanner boundary is NOT a row gap.
  // In vertical mode, "block axis" is X, so spanners span along X.
  interface SpannerBounds {
    start: number;
    end: number;
  }
  const spannerBounds: SpannerBounds[] = [];
  for (const child of allChildren) {
    const childCs = childCsCache.get(child) ?? getComputedStyle(child);
    if (childCs.columnSpan === "all") {
      const childRect =
        childRectCache.get(child) ?? child.getBoundingClientRect();
      if (isVertical) {
        spannerBounds.push({
          start: childRect.left - rect.left,
          end: childRect.right - rect.left,
        });
      } else {
        spannerBounds.push({
          start: childRect.top - rect.top,
          end: childRect.bottom - rect.top,
        });
      }
    }
  }
  spannerBounds.sort((a, b) => a.start - b.start);

  // Split children into content blocks separated by spanners, then
  // detect rows within each block independently.
  // In vertical mode, block axis is X so child bounds use left/right.
  const childBounds = children.map((c) => {
    const r = childRectCache.get(c) ?? c.getBoundingClientRect();
    if (isVertical) {
      return {
        blockStart: r.left - rect.left,
        blockEnd: r.right - rect.left,
        el: c,
      };
    }
    return {
      blockStart: r.top - rect.top,
      blockEnd: r.bottom - rect.top,
      el: c,
    };
  });

  // Check for column-wrap layout with explicit column-height.
  // In column-wrap mode, rows form a fixed grid defined by column-height
  // and row-gap. Using this grid gives exact row positions, avoiding
  // inaccuracy from getBoundingClientRect() on fragmented children.
  const columnHeightPx = parseFloat(getCSSProperty(cs, "columnHeight"));
  // column-wrap: "wrap" always wraps; "auto" (the default) wraps when
  // column-height is specified; "nowrap" never wraps.
  const columnWrap = getCSSProperty(cs, "columnWrap") || "auto";
  const isColumnWrap =
    !Number.isNaN(columnHeightPx) &&
    columnHeightPx > 0 &&
    columnWrap !== "nowrap";

  const contentBlockStart = isVertical ? contentLeft : contentTop;
  const allRowBoundaries: RowBoundary[] = [];

  if (isColumnWrap) {
    // Compute row boundaries from the fixed column-height grid.
    // The grid period is (columnHeight + rowGap). Spanners interrupt
    // content flow but don't shift the grid; they split a grid row
    // into pre-spanner and post-spanner fragments.
    const stride = columnHeightPx + rowGap;
    const maxContentBlock =
      childBounds.length > 0
        ? Math.max(...childBounds.map((cb) => cb.blockEnd))
        : contentBlockStart + blockSize;

    for (
      let rowPos = contentBlockStart;
      rowPos < maxContentBlock;
      rowPos += stride
    ) {
      const rowEnd = rowPos + columnHeightPx;

      // Split this grid row at spanner boundaries.
      let segments: RowBoundary[] = [{ start: rowPos, end: rowEnd }];
      for (const sp of spannerBounds) {
        const next: RowBoundary[] = [];
        for (const seg of segments) {
          if (sp.end <= seg.start || sp.start >= seg.end) {
            next.push(seg);
          } else {
            if (sp.start > seg.start) {
              next.push({ start: seg.start, end: sp.start });
            }
            if (sp.end < seg.end) {
              next.push({ start: sp.end, end: seg.end });
            }
          }
        }
        segments = next;
      }

      for (const seg of segments) {
        if (seg.end - seg.start > 0.5) {
          allRowBoundaries.push(seg);
        }
      }
    }
  } else {
    // Non-wrapping multicol: rows of column boxes are created only where a
    // spanner (column-span: all) interrupts the column boxes. Per CSS
    // Multicol 2 § The multi-column model, a spanner splits the content into
    // separate runs of column boxes — one before the spanner and one after.
    // We detect each such spanner-separated content region independently and
    // find the rows of column boxes within it.
    // Region edges alternate [contentStart, spanner0.start, spanner0.end, ...,
    // +∞]; each [edges[s], edges[s+1]] pair is one content region.
    const regionEdges: number[] = [contentBlockStart];
    for (const sp of spannerBounds) {
      regionEdges.push(sp.start, sp.end);
    }
    regionEdges.push(Number.MAX_SAFE_INTEGER);

    for (let s = 0; s < regionEdges.length - 1; s += 2) {
      const regionStart = regionEdges[s];
      const regionEnd = regionEdges[s + 1];
      const regionChildren = childBounds
        .filter((cb) => {
          const mid = (cb.blockStart + cb.blockEnd) / 2;
          return mid >= regionStart - 1 && mid <= regionEnd + 1;
        })
        .map((cb) => cb.el);

      if (regionChildren.length > 0) {
        const rows = detectMulticolRows(
          regionChildren,
          rect,
          contentBlockStart,
          blockSize,
          columnCount,
          isVertical,
          wm,
          childRectCache,
        );
        if (rows.length > 0) {
          allRowBoundaries.push(...rows);
        } else {
          // Single row — still need a boundary for gap computation
          // against adjacent spanners.
          const childRects = regionChildren.map(
            (c) => childRectCache.get(c) ?? c.getBoundingClientRect(),
          );
          let starts: number[];
          let ends: number[];
          if (isVertical) {
            starts = childRects.map((r) => r.left - rect.left);
            ends = childRects.map((r) => r.right - rect.left);
          } else {
            starts = childRects.map((r) => r.top - rect.top);
            ends = childRects.map((r) => r.bottom - rect.top);
          }
          allRowBoundaries.push({
            start: modeValue(starts),
            end: Math.max(...ends),
          });
        }
      }
    }
  }

  // Add spanner edges as row boundaries.
  for (const sp of spannerBounds) {
    allRowBoundaries.push({ start: sp.start, end: sp.end });
  }
  allRowBoundaries.sort((a, b) => a.start - b.start);

  // Generate row gaps from boundaries.
  // Row gaps run along the block axis (Y in horizontal, X in vertical).
  gapIndex = 0;
  for (let i = 0; i < allRowBoundaries.length - 1; i++) {
    const rowEnd = allRowBoundaries[i].end;
    const nextRowStart = allRowBoundaries[i + 1].start;
    const gapSize = nextRowStart - rowEnd;
    if (gapSize > 0) {
      const effectiveGapSize = rowGap > 0 ? Math.min(gapSize, rowGap) : gapSize;
      rowGaps.push({
        axis: "row",
        center: nextRowStart - effectiveGapSize / 2,
        crossStart: rowCrossStart,
        crossEnd: rowCrossEnd,
        size: effectiveGapSize,
        index: gapIndex++,
      });
    }
  }

  // Apply spanner blocked ranges to column gaps.
  // Spanner bounds are on the block axis (same axis as column gap crossStart/crossEnd).
  for (const sp of spannerBounds) {
    for (const gap of columnGaps) {
      if (!gap.blockedRanges) {
        gap.blockedRanges = [];
      }
      gap.blockedRanges.push({ start: sp.start, end: sp.end });
    }
  }

  // Block column gaps in rows with fewer columns than the max.
  // Also build occupancy grid for visibility-items support.
  const nonSpannerRows =
    allRowBoundaries.length > 0
      ? allRowBoundaries.filter(
          (rb) =>
            !spannerBounds.some(
              (sp) =>
                Math.abs(sp.start - rb.start) < 2 &&
                Math.abs(sp.end - rb.end) < 2,
            ),
        )
      : [];

  // Track per-row column occupancy for both column-gap and row-gap
  // empty range computation.
  const occupiedColsPerRow: Set<number>[] = [];

  for (let ri = 0; ri < nonSpannerRows.length; ri++) {
    const row = nonSpannerRows[ri];
    const rowChildren = childBounds.filter((cb) => {
      if (isColumnWrap) {
        // For column-wrap, use overlap instead of midpoint since
        // fragmented items span multiple rows in their union rect.
        return cb.blockEnd > row.start + 0.5 && cb.blockStart < row.end - 0.5;
      }
      const mid = (cb.blockStart + cb.blockEnd) / 2;
      return mid >= row.start - 1 && mid <= row.end + 1;
    });

    // Determine actual column occupancy by checking which columns have
    // content. Items may fragment across multiple columns (especially
    // with column-fill: auto), so counting children is not sufficient.
    const occupiedCols = new Set<number>();
    for (const cb of rowChildren) {
      const r = childRectCache.get(cb.el) ?? cb.el.getBoundingClientRect();
      const childInlineStart = isVertical
        ? r.top - rect.top
        : r.left - rect.left;
      const childInlineEnd = isVertical
        ? r.bottom - rect.top
        : r.right - rect.left;
      // Check which columns this child overlaps with.
      let colStart = inlineStart;
      for (let ci = 0; ci < columnCount; ci++) {
        const colEnd = colStart + columnWidth;
        if (childInlineEnd > colStart + 1 && childInlineStart < colEnd - 1) {
          occupiedCols.add(ci);
        }
        colStart = colEnd + columnGap;
      }
    }
    occupiedColsPerRow.push(occupiedCols);
    const colsInRow = occupiedCols.size;

    if (colsInRow < columnCount) {
      // Find the highest occupied column index to determine gap thresholds.
      const maxOccupiedCol =
        occupiedCols.size > 0 ? Math.max(...occupiedCols) : -1;

      // emptyRanges: marks gaps where the "after" column (gi+1) is empty.
      // Used for "between" visibility (hide when either side is empty).
      for (let gi = Math.max(0, maxOccupiedCol); gi < columnGaps.length; gi++) {
        const gap = columnGaps[gi];
        if (!gap.emptyRanges) {
          gap.emptyRanges = [];
        }
        gap.emptyRanges.push({ start: row.start, end: row.end });
      }
      // fullyEmptyRanges: marks gaps where BOTH adjacent columns are empty.
      // Used for "around" visibility (hide only when neither side has items).
      for (let gi = maxOccupiedCol + 1; gi < columnGaps.length; gi++) {
        const gap = columnGaps[gi];
        if (!gap.fullyEmptyRanges) {
          gap.fullyEmptyRanges = [];
        }
        gap.fullyEmptyRanges.push({ start: row.start, end: row.end });
      }
    }
  }

  // Build emptyRanges for row gaps based on per-column occupancy in
  // adjacent rows.  A row-gap segment at column ci should be hidden
  // ("between") when either adjacent row has that column empty, and
  // hidden ("around") only when both adjacent rows have it empty.
  for (const rg of rowGaps) {
    const riBefore = rg.index;
    const riAfter = rg.index + 1;
    if (
      riBefore >= occupiedColsPerRow.length ||
      riAfter >= occupiedColsPerRow.length
    ) {
      continue;
    }
    const occBefore = occupiedColsPerRow[riBefore];
    const occAfter = occupiedColsPerRow[riAfter];

    let colStart = inlineStart;
    for (let ci = 0; ci < columnCount; ci++) {
      const colEnd = colStart + columnWidth;
      const beforeOcc = occBefore.has(ci);
      const afterOcc = occAfter.has(ci);

      // "between": hide when either side is empty
      if (!beforeOcc || !afterOcc) {
        if (!rg.emptyRanges) {
          rg.emptyRanges = [];
        }
        rg.emptyRanges.push({ start: colStart, end: colEnd });
      }
      // "around": hide only when both sides are empty
      if (!beforeOcc && !afterOcc) {
        if (!rg.fullyEmptyRanges) {
          rg.fullyEmptyRanges = [];
        }
        rg.fullyEmptyRanges.push({ start: colStart, end: colEnd });
      }

      colStart = colEnd + columnGap;
    }
  }

  // Column and row gap intersections
  // Column gaps need blockedRanges for spanner-interrupted intersections.
  const columnIntersections = computeCrossIntersections(
    columnGaps,
    rowGaps,
    true,
  );
  const rowIntersections = computeCrossIntersections(rowGaps, columnGaps);

  return {
    containerType: "multicol",
    containerRect: rect,
    contentLeft,
    contentTop,
    contentWidth,
    contentHeight,
    columnGaps,
    rowGaps,
    columnIntersections,
    rowIntersections,
    columnGapSize: columnGap,
    rowGapSize: rowGap,
    // Note: multicol does NOT expose occupied/numRows/numCols because
    // isSegmentVisible's trackIndex doesn't map to multicol rows when
    // spanners split content blocks. Multicol uses emptyRanges and
    // fullyEmptyRanges on the Gap objects instead.
    isVertical,
    writingMode: wm,
  };
}

interface RowBoundary {
  start: number;
  end: number;
}

/**
 * Detect row boundaries in a multi-row multicol container by examining
 * child positions. Returns an array of {start, end} ranges for each
 * row of columns. Returns empty if only a single row is detected.
 *
 * In vertical writing modes, rows run along X instead of Y. For
 * vertical-rl/sideways-rl, rows go right-to-left.
 */
function detectMulticolRows(
  children: Element[],
  containerRect: DOMRect,
  _contentBlockStart: number,
  _blockSize: number,
  _columnCount: number,
  isVertical: boolean,
  writingMode: string,
  rectCache?: Map<Element, DOMRect>,
): RowBoundary[] {
  if (children.length === 0) {
    return [];
  }

  const isBlockRTL = isBlockReversedWritingMode(writingMode);

  // Collect block-axis start/end positions for each child.
  // In horizontal mode: top/bottom. In vertical mode: left/right.
  interface ChildBounds {
    blockStart: number;
    blockEnd: number;
    crossSize: number;
  }
  const bounds: ChildBounds[] = [];
  for (const c of children) {
    const r = rectCache?.get(c) ?? c.getBoundingClientRect();
    if (isVertical) {
      bounds.push({
        blockStart: r.left - containerRect.left,
        blockEnd: r.right - containerRect.left,
        crossSize: r.height,
      });
    } else {
      bounds.push({
        blockStart: r.top - containerRect.top,
        blockEnd: r.bottom - containerRect.top,
        crossSize: r.width,
      });
    }
  }

  // Sort by block-start position. For block-RTL (vertical-rl), sort
  // descending so clusters form right-to-left.
  if (isBlockRTL) {
    bounds.sort((a, b) => b.blockStart - a.blockStart);
  } else {
    bounds.sort((a, b) => a.blockStart - b.blockStart);
  }

  // Cluster children into rows by block-start proximity.
  const rowClusters: ChildBounds[][] = [];
  let currentCluster: ChildBounds[] = [bounds[0]];
  let clusterRef = bounds[0].blockStart;
  const itemSize = Math.abs(bounds[0].blockEnd - bounds[0].blockStart);
  const rowThreshold = itemSize / 2;

  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i];
    const dist = isBlockRTL
      ? clusterRef - b.blockStart
      : b.blockStart - clusterRef;
    if (dist <= rowThreshold) {
      currentCluster.push(b);
    } else {
      rowClusters.push(currentCluster);
      currentCluster = [b];
      clusterRef = b.blockStart;
    }
  }
  rowClusters.push(currentCluster);

  if (rowClusters.length <= 1) {
    return [];
  }

  // Build a boundary for each row cluster. We take the statistical mode
  // (most common value) of the children's block-start positions rather than
  // the min/max. Reason: a child's measured block-start can sometimes be
  // offset from the row's true top — e.g. after a spanner the first column's
  // bounding rect can be inflated — so min/max could report a row taller than
  // the actual row of column boxes. The mode reflects the block-start shared
  // by the majority of columns, which is the true row top. The row bottom is
  // then the furthest bottom among the columns that start at that modal top.
  const rows: RowBoundary[] = [];
  for (let ci = 0; ci < rowClusters.length; ci++) {
    const cluster = rowClusters[ci];
    const startVal = modeValue(cluster.map((c) => c.blockStart));
    const modeBtm = cluster
      .filter((c) => Math.abs(c.blockStart - startVal) < 2)
      .map((c) => c.blockEnd);
    const endVal =
      modeBtm.length > 0
        ? Math.max(...modeBtm)
        : Math.max(...cluster.map((c) => c.blockEnd));
    // For block-RTL, blockStart > blockEnd in physical coords, so
    // normalize so that start < end for consistent gap computation.
    rows.push({
      start: Math.min(startVal, endVal),
      end: Math.max(startVal, endVal),
    });
  }

  // Sort rows in ascending physical order for gap computation.
  rows.sort((a, b) => a.start - b.start);

  return rows;
}

/**
 * Find the most common value in an array of numbers (rounded to nearest
 * integer for grouping).
 */
function modeValue(values: number[]): number {
  const counts = new Map<number, { count: number; original: number }>();
  for (const v of values) {
    const key = Math.round(v);
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { count: 1, original: v });
    }
  }
  let best = values[0];
  let bestCount = 0;
  for (const { count, original } of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
      best = original;
    }
  }
  return best;
}
