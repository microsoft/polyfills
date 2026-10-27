/**
 * CSS Gap Decorations property definitions.
 *
 * Source of truth: Chromium's css_properties.json5 and the CSS Gaps spec
 * https://drafts.csswg.org/css-gaps-1/
 *
 * Property names use the NEW cap/junction naming per csswg #13697.
 */

// ---- Value types used in the internal representation ----

/** A single value in a gap decoration list. */
export interface GapValue<T> {
  isRepeat: false;
  value: T;
}

/** A repeat() group expanding to a repeated sequence of values. */
export interface GapRepeater<T> {
  isRepeat: true;
  count: number | "auto";
  values: T[];
}

export type GapDataItem<T> = GapValue<T> | GapRepeater<T>;
export type GapDataList<T> = GapDataItem<T>[];

export type LineStyle =
  | "none"
  | "hidden"
  | "dotted"
  | "dashed"
  | "solid"
  | "double"
  | "groove"
  | "ridge"
  | "inset"
  | "outset";

export type RuleBreak = "none" | "normal" | "intersection";
export type RuleVisibilityItems = "all" | "normal" | "around" | "between";
export type RuleOverlap = "row-over-column" | "column-over-row";

/**
 * A resolved gap-decoration inset value. `length`/`percentage` carry a
 * numeric `value`; `keyword` carries a keyword name (currently only
 * `overlap-join`). Modeled as a discriminated union so additional
 * keywords can be added without overloading the numeric `value`.
 */
export type InsetValue =
  | { type: "length"; value: number }
  | { type: "percentage"; value: number }
  | { type: "keyword"; value: "overlap-join" };

/** Resolved per-element computed gap styles. */
export interface ComputedGapStyles {
  "column-rule-color": GapDataList<string>;
  "column-rule-style": GapDataList<LineStyle>;
  "column-rule-width": GapDataList<number>;
  "row-rule-color": GapDataList<string>;
  "row-rule-style": GapDataList<LineStyle>;
  "row-rule-width": GapDataList<number>;
  "column-rule-break": RuleBreak;
  "row-rule-break": RuleBreak;
  "column-rule-visibility-items": RuleVisibilityItems;
  "row-rule-visibility-items": RuleVisibilityItems;
  "rule-overlap": RuleOverlap;
  "column-rule-inset-cap-start": InsetValue;
  "column-rule-inset-cap-end": InsetValue;
  "column-rule-inset-junction-start": InsetValue;
  "column-rule-inset-junction-end": InsetValue;
  "row-rule-inset-cap-start": InsetValue;
  "row-rule-inset-cap-end": InsetValue;
  "row-rule-inset-junction-start": InsetValue;
  "row-rule-inset-junction-end": InsetValue;
}

export type LonghandName = keyof ComputedGapStyles;

// ---- Longhand definitions ----

export interface LonghandDef {
  initial: unknown;
  type: "color-list" | "style-list" | "width-list" | "keyword" | "inset";
}

export const LONGHANDS: Record<LonghandName, LonghandDef> = {
  "column-rule-color": {
    initial: [{ isRepeat: false, value: "currentcolor" }],
    type: "color-list",
  },
  "row-rule-color": {
    initial: [{ isRepeat: false, value: "currentcolor" }],
    type: "color-list",
  },
  "column-rule-style": {
    initial: [{ isRepeat: false, value: "none" }],
    type: "style-list",
  },
  "row-rule-style": {
    initial: [{ isRepeat: false, value: "none" }],
    type: "style-list",
  },
  "column-rule-width": {
    initial: [{ isRepeat: false, value: 3 }], // medium = 3px
    type: "width-list",
  },
  "row-rule-width": {
    initial: [{ isRepeat: false, value: 3 }],
    type: "width-list",
  },
  "column-rule-break": {
    initial: "normal",
    type: "keyword",
  },
  "row-rule-break": {
    initial: "normal",
    type: "keyword",
  },
  "column-rule-visibility-items": {
    initial: "normal",
    type: "keyword",
  },
  "row-rule-visibility-items": {
    initial: "normal",
    type: "keyword",
  },
  "rule-overlap": {
    initial: "row-over-column",
    type: "keyword",
  },
  "column-rule-inset-cap-start": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "column-rule-inset-cap-end": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "column-rule-inset-junction-start": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "column-rule-inset-junction-end": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "row-rule-inset-cap-start": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "row-rule-inset-cap-end": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "row-rule-inset-junction-start": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
  "row-rule-inset-junction-end": {
    initial: { type: "length", value: 0 },
    type: "inset",
  },
};

// ---- Shorthand definitions ----

export interface ShorthandDef {
  longhands: LonghandName[];
}

export const SHORTHANDS: Record<string, ShorthandDef> = {
  // width/style/color per-axis
  "column-rule": {
    longhands: ["column-rule-width", "column-rule-style", "column-rule-color"],
  },
  "row-rule": {
    longhands: ["row-rule-width", "row-rule-style", "row-rule-color"],
  },
  // bidirectional width/style/color
  rule: {
    longhands: [
      "column-rule-width",
      "column-rule-style",
      "column-rule-color",
      "row-rule-width",
      "row-rule-style",
      "row-rule-color",
    ],
  },
  "rule-color": {
    longhands: ["column-rule-color", "row-rule-color"],
  },
  "rule-style": {
    longhands: ["column-rule-style", "row-rule-style"],
  },
  "rule-width": {
    longhands: ["column-rule-width", "row-rule-width"],
  },
  // break
  "rule-break": {
    longhands: ["column-rule-break", "row-rule-break"],
  },
  // visibility
  "rule-visibility-items": {
    longhands: ["column-rule-visibility-items", "row-rule-visibility-items"],
  },
  // inset per-axis universal: <cap-start> <cap-end>? [ / <junc-start> <junc-end>? ]?
  "column-rule-inset": {
    longhands: [
      "column-rule-inset-cap-start",
      "column-rule-inset-cap-end",
      "column-rule-inset-junction-start",
      "column-rule-inset-junction-end",
    ],
  },
  "row-rule-inset": {
    longhands: [
      "row-rule-inset-cap-start",
      "row-rule-inset-cap-end",
      "row-rule-inset-junction-start",
      "row-rule-inset-junction-end",
    ],
  },
  "rule-inset": {
    longhands: [
      "column-rule-inset-cap-start",
      "column-rule-inset-cap-end",
      "column-rule-inset-junction-start",
      "column-rule-inset-junction-end",
      "row-rule-inset-cap-start",
      "row-rule-inset-cap-end",
      "row-rule-inset-junction-start",
      "row-rule-inset-junction-end",
    ],
  },
  // inset cap shorthands: <start> <end>?
  "column-rule-inset-cap": {
    longhands: ["column-rule-inset-cap-start", "column-rule-inset-cap-end"],
  },
  "row-rule-inset-cap": {
    longhands: ["row-rule-inset-cap-start", "row-rule-inset-cap-end"],
  },
  "rule-inset-cap": {
    longhands: [
      "column-rule-inset-cap-start",
      "column-rule-inset-cap-end",
      "row-rule-inset-cap-start",
      "row-rule-inset-cap-end",
    ],
  },
  // inset junction shorthands: <start> <end>?
  "column-rule-inset-junction": {
    longhands: [
      "column-rule-inset-junction-start",
      "column-rule-inset-junction-end",
    ],
  },
  "row-rule-inset-junction": {
    longhands: ["row-rule-inset-junction-start", "row-rule-inset-junction-end"],
  },
  "rule-inset-junction": {
    longhands: [
      "column-rule-inset-junction-start",
      "column-rule-inset-junction-end",
      "row-rule-inset-junction-start",
      "row-rule-inset-junction-end",
    ],
  },
  // inset start/end shorthands: sets cap+junction start (or end) together
  "column-rule-inset-start": {
    longhands: [
      "column-rule-inset-cap-start",
      "column-rule-inset-junction-start",
    ],
  },
  "column-rule-inset-end": {
    longhands: ["column-rule-inset-cap-end", "column-rule-inset-junction-end"],
  },
  "row-rule-inset-start": {
    longhands: ["row-rule-inset-cap-start", "row-rule-inset-junction-start"],
  },
  "row-rule-inset-end": {
    longhands: ["row-rule-inset-cap-end", "row-rule-inset-junction-end"],
  },
  "rule-inset-start": {
    longhands: [
      "column-rule-inset-cap-start",
      "column-rule-inset-junction-start",
      "row-rule-inset-cap-start",
      "row-rule-inset-junction-start",
    ],
  },
  "rule-inset-end": {
    longhands: [
      "column-rule-inset-cap-end",
      "column-rule-inset-junction-end",
      "row-rule-inset-cap-end",
      "row-rule-inset-junction-end",
    ],
  },
};

/** Set of all recognized property names (longhands + shorthands). */
export const ALL_PROPERTY_NAMES = new Set([
  ...Object.keys(LONGHANDS),
  ...Object.keys(SHORTHANDS),
]);

/** Check if a CSS property name is a gap decoration property. */
export function isGapDecorationProperty(name: string): boolean {
  return ALL_PROPERTY_NAMES.has(name);
}

/** Get default computed styles with all initial values. */
export function getInitialComputedStyles(): ComputedGapStyles {
  const styles = {} as Record<string, unknown>;
  for (const [name, def] of Object.entries(LONGHANDS)) {
    if (Array.isArray(def.initial)) {
      styles[name] = def.initial.map((item: Record<string, unknown>) => ({
        ...item,
      }));
    } else if (typeof def.initial === "object" && def.initial !== null) {
      styles[name] = { ...(def.initial as Record<string, unknown>) };
    } else {
      styles[name] = def.initial;
    }
  }
  return styles as unknown as ComputedGapStyles;
}
