/**
 * Flex geometry — derive gap positions from a flex container.
 *
 * Flex is fundamentally 1D: each flex line has its own column gaps,
 * and row gaps exist between flex lines.
 */

import {
  type Gap,
  type GapGeometry,
  getContentBox,
  type Intersection,
  isVerticalWritingMode,
} from "./common.js";

export function computeFlexGeometry(el: Element): GapGeometry {
  const { cs, rect, contentLeft, contentTop, contentWidth, contentHeight } =
    getContentBox(el);

  const columnGap = parseFloat(cs.columnGap) || 0;
  const rowGap = parseFloat(cs.rowGap) || 0;

  // Determine physical main axis. In horizontal writing mode, flex-direction
  // "row" runs horizontally. In vertical writing mode, "row" runs vertically
  // (the inline direction flips). We need the PHYSICAL axis for layout.
  const wm = cs.writingMode;
  const isVerticalWM = isVerticalWritingMode(wm);

  const dirRow =
    cs.flexDirection === "row" || cs.flexDirection === "row-reverse";
  // Physical main axis is horizontal when: row in horizontal WM, or column in vertical WM
  const isRow = isVerticalWM ? !dirRow : dirRow;

  // Group children into flex lines by comparing their cross-axis positions
  const children = Array.from(el.children).filter((c) => {
    if (c.hasAttribute("data-gap-decorations-polyfill")) {
      return false;
    }
    const pos = getComputedStyle(c).position;
    return pos !== "absolute" && pos !== "fixed";
  });

  // Snapshot each child's bounding rect once. Geometry construction is a
  // single synchronous read-only pass that never mutates the tree, so this
  // is not about avoiding forced reflow; it just avoids issuing the same
  // getBoundingClientRect() repeatedly (e.g. O(n log n) times inside the
  // line-grouping sort comparator).
  const rectCache = new Map<Element, DOMRect>();
  for (const c of children) {
    rectCache.set(c, c.getBoundingClientRect());
  }

  const lines = groupIntoFlexLines(children, el, isRow, rectCache);

  // Adjust flex line boundaries for content-distribution (align-content /
  // justify-content on the cross axis). When align-content distributes
  // extra space (stretch, space-between, space-around, space-evenly),
  // the flex line boundaries extend beyond item bounds. We compute
  // the actual line boundaries by distributing available cross-space.
  const crossSize = isRow ? contentHeight : contentWidth;
  // For row flex, cross-axis gap = rowGap; for column flex, cross-axis gap = columnGap.
  // Use logical dirRow, not physical isRow, since CSS column-gap/row-gap are
  // logical properties tied to flex-direction, not physical orientation.
  const crossGap = dirRow ? rowGap : columnGap;
  adjustLineBoundariesForDistribution(
    lines,
    cs.alignContent,
    crossSize,
    crossGap,
    isRow ? contentTop : contentLeft,
  );

  // CSS column-gap/column-rule always refers to the inline axis and
  // row-gap/row-rule to the block axis. In flex:
  //   flex-direction: row  → main = inline → main gaps are column-gaps
  //   flex-direction: column → main = block → main gaps are row-gaps
  // Use the LOGICAL flex-direction (dirRow) for labelling, not the
  // physical axis (isRow), so writing-mode doesn't invert the mapping.
  const mainAxisGaps: Gap[] = [];
  const crossAxisGaps: Gap[] = [];
  const mainAxisLabel: "column" | "row" = dirRow ? "column" : "row";
  const crossAxisLabel: "column" | "row" = dirRow ? "row" : "column";
  let gapIndex = 0;

  // Main-axis gaps (gaps between items within each flex line)
  //
  // In flex layout, each line's main-axis gaps are independent — they don't
  // extend through cross-axis gaps. The cross-extent of each gap matches
  // the flex line's bounds (crossStart/crossEnd from the line).
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const items = line.items;

    for (let i = 0; i < items.length - 1; i++) {
      const itemRect =
        rectCache.get(items[i]) ?? items[i].getBoundingClientRect();
      const nextRect =
        rectCache.get(items[i + 1]) ?? items[i + 1].getBoundingClientRect();

      let gapCenter: number, gapSize: number;

      if (isRow) {
        const gapStart = itemRect.right - rect.left;
        const gapEnd = nextRect.left - rect.left;
        gapSize = gapEnd - gapStart;
        gapCenter = gapStart + gapSize / 2;
      } else {
        const gapStart = itemRect.bottom - rect.top;
        const gapEnd = nextRect.top - rect.top;
        gapSize = gapEnd - gapStart;
        gapCenter = gapStart + gapSize / 2;
      }

      if (gapSize >= 0) {
        mainAxisGaps.push({
          axis: mainAxisLabel,
          center: gapCenter,
          crossStart: line.crossStart,
          crossEnd: line.crossEnd,
          size: gapSize,
          index: gapIndex++,
          lineIndex: li,
          adjacentItems: { before: items[i], after: items[i + 1] },
        });
      }
    }
  }

  // Cross-axis gaps (gaps between flex lines)
  gapIndex = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const lineEnd = lines[i].crossEnd;
    const nextLineStart = lines[i + 1].crossStart;
    const gapSize = nextLineStart - lineEnd;

    if (gapSize >= 0) {
      crossAxisGaps.push({
        axis: crossAxisLabel,
        center: lineEnd + gapSize / 2,
        crossStart: isRow ? contentLeft : contentTop,
        crossEnd: isRow
          ? contentLeft + contentWidth
          : contentTop + contentHeight,
        size: gapSize,
        index: gapIndex++,
      });
    }
  }

  // Main-axis gaps: each line's gaps are independent segments spanning
  // from crossStart to crossEnd. In flex/multicol, main-axis gaps abut
  // (but don't overlap) cross-axis gaps. We set crossingGapWidth at the
  // abutting endpoints so overlap-join can extend decorations to meet
  // the cross-axis decoration.
  const mainAxisIntersections = new Map<number, Intersection[]>();
  for (const gap of mainAxisGaps) {
    // Find the cross-axis gap size at the start and end of this main-axis gap.
    // In flex, main-axis gaps abut cross-axis gaps. Set crossingGapWidth
    // so that overlap-join can detect the abutting gap and extend.
    const startCrossGapWidth = getCrossGapWidthAtPosition(
      gap.crossStart,
      crossAxisGaps,
    );
    const endCrossGapWidth = getCrossGapWidthAtPosition(
      gap.crossEnd,
      crossAxisGaps,
    );
    const ints: Intersection[] = [
      {
        position: gap.crossStart,
        type: "edge",
        crossingGapWidth: startCrossGapWidth,
      },
      {
        position: gap.crossEnd,
        type: "edge",
        crossingGapWidth: endCrossGapWidth,
      },
    ];
    mainAxisIntersections.set(gap.index, ints);
  }

  // Cross-axis gap intersections.
  // Each cross-axis gap sits between two adjacent flex lines. The main-axis
  // gaps of those two lines abut this cross-axis gap (they meet it end-on;
  // they do not run through it). Each such abutting main-axis gap is recorded
  // as an intersection on the cross-axis gap so that rule-break: intersection
  // can break the cross-axis rule where a main-axis gap meets it.
  const crossAxisIntersections = new Map<number, Intersection[]>();
  for (let ri = 0; ri < crossAxisGaps.length; ri++) {
    const gap = crossAxisGaps[ri];
    const lineAboveIdx = ri;
    const lineBelowIdx = ri + 1;

    const ints: Intersection[] = [
      { position: gap.crossStart, type: "edge", crossingGapWidth: 0 },
    ];

    // Collect main-axis gaps from both adjacent lines
    const allCrossingGaps = mainAxisGaps.filter(
      (cg) => cg.lineIndex === lineAboveIdx || cg.lineIndex === lineBelowIdx,
    );

    // A main-axis gap in the line above and one in the line below can land at
    // the same (or overlapping) position along the cross-axis gap — e.g. two
    // equal-width lines have their inter-item gaps at the same offsets. Merge
    // such overlapping position ranges so each distinct crossing produces a
    // single intersection pair rather than duplicated/overlapping endpoints.
    const ranges: { start: number; end: number }[] = [];
    for (const cg of allCrossingGaps) {
      const start = cg.center - cg.size / 2;
      const end = cg.center + cg.size / 2;
      ranges.push({ start, end });
    }
    // Sort and merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const r of ranges) {
      if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 0.5) {
        merged[merged.length - 1].end = Math.max(
          merged[merged.length - 1].end,
          r.end,
        );
      } else {
        merged.push({ ...r });
      }
    }

    for (const r of merged) {
      const crossingWidth = r.end - r.start;
      ints.push({
        position: r.start,
        type: "cross-end",
        crossingGapWidth: crossingWidth,
      });
      ints.push({
        position: r.end,
        type: "cross-start",
        crossingGapWidth: crossingWidth,
      });
    }

    ints.push({ position: gap.crossEnd, type: "edge", crossingGapWidth: 0 });
    ints.sort((a, b) => a.position - b.position);
    crossAxisIntersections.set(gap.index, ints);
  }

  // Map internal main/cross axis arrays to CSS-semantic column/row arrays.
  // Use dirRow (logical flex-direction), not isRow (physical axis).
  const columnGaps2 = dirRow ? mainAxisGaps : crossAxisGaps;
  const rowGaps2 = dirRow ? crossAxisGaps : mainAxisGaps;
  const columnIntersections = dirRow
    ? mainAxisIntersections
    : crossAxisIntersections;
  const rowIntersections = dirRow
    ? crossAxisIntersections
    : mainAxisIntersections;

  return {
    containerType: "flex",
    containerRect: rect,
    contentLeft,
    contentTop,
    contentWidth,
    contentHeight,
    columnGaps: columnGaps2,
    rowGaps: rowGaps2,
    columnIntersections,
    rowIntersections,
    columnGapSize: columnGap,
    rowGapSize: rowGap,
    isVertical: isVerticalWM,
    writingMode: wm,
  };
}

interface FlexLine {
  items: Element[];
  crossStart: number;
  crossEnd: number;
}

/**
 * Find the cross-axis gap width at a given position along the cross axis.
 * In flex, main-axis gaps abut cross-axis gaps; this returns the size of
 * the abutting cross-axis gap if the position is at its boundary.
 */
function getCrossGapWidthAtPosition(
  position: number,
  crossAxisGaps: Gap[],
): number {
  for (const cg of crossAxisGaps) {
    const cgStart = cg.center - cg.size / 2;
    const cgEnd = cg.center + cg.size / 2;
    // Check if the position is at either edge of this cross-axis gap
    if (Math.abs(position - cgStart) < 1 || Math.abs(position - cgEnd) < 1) {
      return cg.size;
    }
  }
  return 0;
}

function groupIntoFlexLines(
  children: Element[],
  container: Element,
  isRow: boolean,
  rectCache: Map<Element, DOMRect>,
): FlexLine[] {
  if (children.length === 0) {
    return [];
  }

  const containerRect = container.getBoundingClientRect();
  const lines: FlexLine[] = [];

  const getRect = (el: Element): DOMRect =>
    rectCache.get(el) ?? el.getBoundingClientRect();

  // Sort children by their position in the main axis
  const sorted = [...children].sort((a, b) => {
    const aRect = getRect(a);
    const bRect = getRect(b);
    if (isRow) {
      // Group by cross-axis (top) position first, then main-axis
      const crossDiff = aRect.top - bRect.top;
      if (Math.abs(crossDiff) > 1) {
        return crossDiff;
      }
      return aRect.left - bRect.left;
    }
    const crossDiff = aRect.left - bRect.left;
    if (Math.abs(crossDiff) > 1) {
      return crossDiff;
    }
    return aRect.top - bRect.top;
  });

  // Group into lines by cross-axis position clustering
  let currentLine: Element[] = [sorted[0]];
  let lineRef = getRect(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const childRect = getRect(sorted[i]);
    const crossPos = isRow ? childRect.top : childRect.left;
    const refCrossEnd = isRow ? lineRef.bottom : lineRef.right;

    // Same line if cross positions overlap significantly
    if (crossPos < refCrossEnd - 1) {
      currentLine.push(sorted[i]);
    } else {
      lines.push(buildFlexLine(currentLine, containerRect, isRow, getRect));
      currentLine = [sorted[i]];
      lineRef = childRect;
    }
  }

  if (currentLine.length > 0) {
    lines.push(buildFlexLine(currentLine, containerRect, isRow, getRect));
  }

  return lines;
}

function buildFlexLine(
  items: Element[],
  containerRect: DOMRect,
  isRow: boolean,
  getRect: (el: Element) => DOMRect,
): FlexLine {
  let crossStart = Infinity;
  let crossEnd = -Infinity;

  for (const item of items) {
    const r = getRect(item);
    if (isRow) {
      crossStart = Math.min(crossStart, r.top - containerRect.top);
      crossEnd = Math.max(crossEnd, r.bottom - containerRect.top);
    } else {
      crossStart = Math.min(crossStart, r.left - containerRect.left);
      crossEnd = Math.max(crossEnd, r.right - containerRect.left);
    }
  }

  // Sort items by main-axis position
  items.sort((a, b) => {
    const ar = getRect(a);
    const br = getRect(b);
    return isRow ? ar.left - br.left : ar.top - br.top;
  });

  return { items, crossStart, crossEnd };
}

/**
 * Adjust flex line cross-axis boundaries to account for content distribution
 * via align-content. When the container has extra cross-axis space, the browser
 * distributes it per align-content, making flex lines larger than their items.
 * We recompute the line boundaries so that row gaps are positioned correctly.
 */
function adjustLineBoundariesForDistribution(
  lines: FlexLine[],
  alignContent: string,
  crossSize: number,
  rowGap: number,
  crossOffset: number,
): void {
  if (lines.length <= 1) {
    return;
  }

  // Sum item-derived line heights (content sizes)
  const lineContentSizes = lines.map((l) => l.crossEnd - l.crossStart);
  const totalContent = lineContentSizes.reduce((a, b) => a + b, 0);
  const totalGaps = rowGap * (lines.length - 1);
  const freeSpace = crossSize - totalContent - totalGaps;

  // No extra space to distribute
  if (freeSpace <= 1) {
    return;
  }

  // Compute new line positions based on align-content
  const ac = alignContent.split(" ")[0]; // handle "safe center" etc.
  let pos = crossOffset;

  for (let i = 0; i < lines.length; i++) {
    let lineSize = lineContentSizes[i];

    if (ac === "stretch" || ac === "normal") {
      // Distribute extra space equally among all lines
      lineSize += freeSpace / lines.length;
    }

    if (i === 0) {
      if (ac === "center") {
        pos = crossOffset + freeSpace / 2;
      } else if (ac === "flex-end" || ac === "end") {
        pos = crossOffset + freeSpace;
      } else if (ac === "space-around") {
        pos = crossOffset + freeSpace / (lines.length * 2);
      } else if (ac === "space-evenly") {
        pos = crossOffset + freeSpace / (lines.length + 1);
      }
      // flex-start, start, stretch, normal: pos stays at crossOffset
    }

    lines[i].crossStart = pos;
    lines[i].crossEnd = pos + lineSize;
    pos += lineSize;

    if (i < lines.length - 1) {
      if (ac === "space-between") {
        pos += rowGap + freeSpace / (lines.length - 1);
      } else if (ac === "space-around") {
        pos += rowGap + freeSpace / lines.length;
      } else if (ac === "space-evenly") {
        pos += rowGap + freeSpace / (lines.length + 1);
      } else {
        pos += rowGap;
      }
    }
  }
}
