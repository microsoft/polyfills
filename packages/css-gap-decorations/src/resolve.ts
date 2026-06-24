/**
 * Repeat expansion and decoration value resolution.
 *
 * Given a GapDataList and a gap count, expand integer and auto repeats
 * into a flat list of values, one per gap.
 *
 * Reference: css_gap_decoration_property_utils.cc GetExpandedWidths
 */

import type { ContainerType } from "./cascade.js";
import type {
  GapDataList,
  RuleBreak,
  RuleVisibilityItems,
} from "./properties.js";

/**
 * Expand a GapDataList to a flat array of `gapCount` values.
 *
 * Algorithm (mirrors spec §4.6):
 * 1. Expand integer repeaters inline.
 * 2. If no auto repeater: cycle the expanded list to fill gapCount.
 * 3. If auto repeater present:
 *    a. leading = items before auto
 *    b. trailing = items after auto
 *    c. auto fills remaining slots, cycling its values
 */
export function expandGapDataList<T>(
  list: GapDataList<T>,
  gapCount: number,
): T[] {
  if (gapCount <= 0) {
    return [];
  }

  // Find auto repeater index (at most one)
  let autoIndex = -1;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item.isRepeat && item.count === "auto") {
      autoIndex = i;
      break;
    }
  }

  if (autoIndex === -1) {
    // No auto repeater — expand integers, then cycle
    const expanded = expandIntegerRepeats(list);
    if (expanded.length === 0) {
      return [];
    }
    const result: T[] = [];
    for (let i = 0; i < gapCount; i++) {
      result.push(expanded[i % expanded.length]);
    }
    return result;
  }

  // Has auto repeater
  const leading = expandIntegerRepeats(list.slice(0, autoIndex));
  const trailing = expandIntegerRepeats(list.slice(autoIndex + 1));
  const autoValues = (list[autoIndex] as { values: T[] }).values;

  if (autoValues.length === 0) {
    // degenerate — just use leading + trailing
    const combined = [...leading, ...trailing];
    const result: T[] = [];
    for (let i = 0; i < gapCount; i++) {
      result.push(combined[i % combined.length]);
    }
    return result;
  }

  const result: T[] = new Array(gapCount);

  // Fill leading
  const leadingCount = Math.min(leading.length, gapCount);
  for (let i = 0; i < leadingCount; i++) {
    result[i] = leading[i];
  }

  // Fill trailing (from the end, not overlapping leading)
  const trailingCount = Math.min(trailing.length, gapCount - leadingCount);
  for (let i = 0; i < trailingCount; i++) {
    result[gapCount - trailingCount + i] = trailing[i];
  }

  // Fill auto region (between leading and trailing)
  const autoStart = leadingCount;
  const autoEnd = gapCount - trailingCount;
  const autoCount = autoEnd - autoStart;
  for (let i = 0; i < autoCount; i++) {
    result[autoStart + i] = autoValues[i % autoValues.length];
  }

  return result;
}

/** Expand integer repeats into a flat array, leaving auto repeaters as-is. */
function expandIntegerRepeats<T>(list: GapDataList<T>): T[] {
  const result: T[] = [];
  for (const item of list) {
    if (!item.isRepeat) {
      result.push(item.value);
    } else if (typeof item.count === "number") {
      for (let i = 0; i < item.count; i++) {
        result.push(...item.values);
      }
    }
    // skip auto repeater (shouldn't be here after slicing)
  }
  return result;
}

/**
 * Resolve the effective rule-break behavior for a container type + axis.
 *
 * Spec §3.2: `normal` depends on container type:
 * - Grid: break at T-intersections but not cross (handled in segment selection)
 * - Flex: same as `none`
 * - Multicol column-rule-break: same as `intersection`
 * - Multicol row-rule-break: same as `none`
 */
export function resolveRuleBreak(
  value: RuleBreak,
  containerType: ContainerType,
  axis: "column" | "row",
): RuleBreak {
  if (value !== "normal") {
    return value;
  }
  switch (containerType) {
    case "grid":
      return "normal"; // grid has special "normal" behavior (T but not cross)
    case "flex":
      return "none";
    case "multicol":
      return axis === "column" ? "intersection" : "none";
    default:
      return "none";
  }
}

/**
 * Resolve the effective rule-visibility-items behavior.
 *
 * Spec §3.4: `normal` depends on container type:
 * - Grid: same as `all`
 * - Multicol column-rule-visibility-items: same as `between`
 * - Multicol row-rule-visibility-items: same as `all`
 */
export function resolveVisibilityItems(
  value: RuleVisibilityItems,
  containerType: ContainerType,
  axis: "column" | "row",
): RuleVisibilityItems {
  if (value !== "normal") {
    return value;
  }
  switch (containerType) {
    case "grid":
      return "all";
    case "multicol":
      return axis === "column" ? "between" : "all";
    default:
      return "all";
  }
}
