/**
 * CSS parser for gap decoration properties.
 *
 * Uses lightweight custom parsers to extract gap-decoration declarations
 * from stylesheets and inline styles. Value parsing for repeat(),
 * <gap-rule>, and inset shorthands uses token-based classification.
 */

import {
  type GapDataList,
  type InsetValue,
  isGapDecorationProperty,
  type LineStyle,
  type LonghandName,
  type RuleBreak,
  type RuleOverlap,
  type RuleVisibilityItems,
  SHORTHANDS,
} from "./properties.js";

// ---- Types for parsed declarations ----

export interface ParsedDeclaration {
  selector: string;
  specificity: [number, number, number];
  property: string;
  value: string; // raw CSS text
  important: boolean;
  sourceOrder: number;
}

export interface ParsedStylesheet {
  declarations: ParsedDeclaration[];
}

// ---- Stylesheet walking ----

let globalSourceOrder = 0;

/**
 * Reset the global source order counter.  Must be called before
 * re-parsing all stylesheets so that source-order numbers are
 * consistent across sheets (avoids stale high numbers from a
 * previous parse inverting cascade priorities).
 */
export function resetSourceOrder(): void {
  globalSourceOrder = 0;
}

/**
 * Parse a CSS text and extract all gap-decoration declarations.
 */
export function parseStylesheet(cssText: string): ParsedStylesheet {
  const declarations: ParsedDeclaration[] = [];
  const stripped = stripComments(cssText);
  walkRuleBlocks(stripped, (selector, body) => {
    const specificity = computeSpecificity(selector);
    for (const decl of parseDeclarationBlock(body)) {
      const propName = decl.property.toLowerCase();
      if (!isGapDecorationProperty(propName)) {
        continue;
      }
      declarations.push({
        selector,
        specificity,
        property: propName,
        value: decl.value,
        important: decl.important,
        sourceOrder: globalSourceOrder++,
      });
    }
  });
  return { declarations };
}

/**
 * Parse an inline style string and extract gap-decoration declarations.
 */
export function parseInlineStyle(
  styleText: string,
): Map<string, { value: string; important: boolean }> {
  const result = new Map<string, { value: string; important: boolean }>();

  for (const decl of parseDeclarationBlock(styleText)) {
    const propName = decl.property.toLowerCase();
    if (!isGapDecorationProperty(propName)) {
      continue;
    }
    result.set(propName, {
      value: decl.value,
      important: decl.important,
    });
  }

  return result;
}

// ---- Value parsers ----

const LINE_STYLES = new Set<string>([
  "none",
  "hidden",
  "dotted",
  "dashed",
  "solid",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

const LINE_WIDTH_KEYWORDS: Record<string, number> = {
  thin: 1,
  medium: 3,
  thick: 5,
};

const RULE_BREAK_VALUES = new Set<string>(["none", "normal", "intersection"]);
const VISIBILITY_VALUES = new Set<string>([
  "all",
  "normal",
  "around",
  "between",
]);
const OVERLAP_VALUES = new Set<string>(["row-over-column", "column-over-row"]);

/**
 * Parse a comma-separated list of values with repeat() support.
 * Used for column-rule-color, column-rule-style, column-rule-width, etc.
 */
export function parseColorList(value: string): GapDataList<string> | null {
  return parseCommaSeparatedList(value, parseColorValue);
}

export function parseStyleList(value: string): GapDataList<LineStyle> | null {
  return parseCommaSeparatedList(value, parseStyleValue);
}

export function parseWidthList(value: string): GapDataList<number> | null {
  return parseCommaSeparatedList(value, parseWidthValue);
}

function parseColorValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Accept any valid CSS color — it is passed through to the segment
  // div's border color, where the browser validates it.
  return trimmed;
}

function parseStyleValue(raw: string): LineStyle | null {
  const trimmed = raw.trim().toLowerCase();
  if (LINE_STYLES.has(trimmed)) {
    return trimmed as LineStyle;
  }
  return null;
}

function parseWidthValue(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in LINE_WIDTH_KEYWORDS) {
    return LINE_WIDTH_KEYWORDS[trimmed];
  }
  const px = parseLengthToPx(trimmed);
  if (px !== null && px >= 0) {
    return px;
  }
  return null;
}

/**
 * Generic comma-separated list parser with repeat() support.
 */
function parseCommaSeparatedList<T>(
  value: string,
  parseSingle: (raw: string) => T | null,
): GapDataList<T> | null {
  const result: GapDataList<T> = [];
  // Split on top-level commas (not inside parens)
  const parts = splitTopLevelCommas(value);
  let hasAutoRepeat = false;

  for (const part of parts) {
    const trimmed = part.trim();

    // Check for repeat(...)
    const repeatMatch = trimmed.match(/^repeat\s*\(/i);
    if (repeatMatch) {
      const inner = extractParenContents(trimmed, repeatMatch[0].length - 1);
      if (!inner) {
        return null;
      }

      const repeatParts = splitTopLevelCommas(inner);
      if (repeatParts.length < 2) {
        return null;
      }

      const countStr = repeatParts[0].trim().toLowerCase();
      let count: number | "auto";
      if (countStr === "auto") {
        if (hasAutoRepeat) {
          return null; // at most one auto repeat
        }
        hasAutoRepeat = true;
        count = "auto";
      } else {
        count = parseInt(countStr, 10);
        if (Number.isNaN(count) || count < 1) {
          return null;
        }
      }

      const values: T[] = [];
      for (let i = 1; i < repeatParts.length; i++) {
        const parsed = parseSingle(repeatParts[i]);
        if (parsed === null) {
          return null;
        }
        values.push(parsed);
      }

      result.push({ isRepeat: true, count, values });
    } else {
      const parsed = parseSingle(trimmed);
      if (parsed === null) {
        return null;
      }
      result.push({ isRepeat: false, value: parsed });
    }
  }

  return result.length > 0 ? result : null;
}

/** Decomposed width/style/color for one <gap-rule> item in a list. */
export interface GapRuleParsed {
  width: string | null;
  style: string | null;
  color: string | null;
}

/**
 * Parse a <gap-rule> value: <line-width> || <line-style> || <color>.
 * Uses token classification: line-style keywords → line-width
 * keywords/lengths → color (remainder). Any of the three may be omitted;
 * the omitted slots are returned as null so callers can fill in defaults.
 */
export function parseGapRule(raw: string): GapRuleParsed | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const tokens = splitValueTokens(trimmed);
  if (tokens.length === 0) {
    return null;
  }

  let width: string | null = null;
  let style: string | null = null;
  let color: string | null = null;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!style && LINE_STYLES.has(lower)) {
      style = token;
    } else if (!width && isLineWidth(lower)) {
      width = token;
    } else if (!color) {
      color = token;
    } else {
      // Extra token that doesn't fit any slot — invalid
      return null;
    }
  }

  if (!width && !style && !color) {
    return null;
  }
  return { width, style, color };
}

/** Check if a lowercased token is a <line-width> value. */
function isLineWidth(lower: string): boolean {
  if (lower in LINE_WIDTH_KEYWORDS) {
    return true;
  }
  return parseLengthToPx(lower) !== null || lower === "0";
}

/**
 * Parse a column-rule / row-rule shorthand value.
 * Value is a comma-separated list of <gap-rule> | repeat(<int>|auto, <gap-rule>#)
 */
export function parseRuleShorthand(value: string): {
  widths: GapDataList<number>;
  styles: GapDataList<LineStyle>;
  colors: GapDataList<string>;
} | null {
  const parts = splitTopLevelCommas(value);
  const widths: GapDataList<number> = [];
  const styles: GapDataList<LineStyle> = [];
  const colors: GapDataList<string> = [];
  let hasAutoRepeat = false;

  for (const part of parts) {
    const trimmed = part.trim();
    const repeatMatch = trimmed.match(/^repeat\s*\(/i);

    if (repeatMatch) {
      const inner = extractParenContents(trimmed, repeatMatch[0].length - 1);
      if (!inner) {
        return null;
      }

      const repeatParts = splitTopLevelCommas(inner);
      if (repeatParts.length < 2) {
        return null;
      }

      const countStr = repeatParts[0].trim().toLowerCase();
      let count: number | "auto";
      if (countStr === "auto") {
        if (hasAutoRepeat) {
          return null;
        }
        hasAutoRepeat = true;
        count = "auto";
      } else {
        count = parseInt(countStr, 10);
        if (Number.isNaN(count) || count < 1) {
          return null;
        }
      }

      const wVals: number[] = [];
      const sVals: LineStyle[] = [];
      const cVals: string[] = [];

      for (let i = 1; i < repeatParts.length; i++) {
        const parsed = parseGapRule(repeatParts[i]);
        if (!parsed) {
          return null;
        }
        wVals.push(resolveWidth(parsed.width));
        sVals.push(resolveStyle(parsed.style));
        cVals.push(parsed.color || "currentcolor");
      }

      widths.push({ isRepeat: true, count, values: wVals });
      styles.push({ isRepeat: true, count, values: sVals });
      colors.push({ isRepeat: true, count, values: cVals });
    } else {
      const parsed = parseGapRule(trimmed);
      if (!parsed) {
        return null;
      }
      widths.push({ isRepeat: false, value: resolveWidth(parsed.width) });
      styles.push({ isRepeat: false, value: resolveStyle(parsed.style) });
      colors.push({ isRepeat: false, value: parsed.color || "currentcolor" });
    }
  }

  if (widths.length === 0) {
    return null;
  }
  return { widths, styles, colors };
}

function resolveWidth(raw: string | null): number {
  if (!raw) {
    return 3; // medium
  }
  const lower = raw.trim().toLowerCase();
  if (lower in LINE_WIDTH_KEYWORDS) {
    return LINE_WIDTH_KEYWORDS[lower];
  }
  return parseLengthToPx(lower) ?? 3;
}

function resolveStyle(raw: string | null): LineStyle {
  if (!raw) {
    return "none";
  }
  const lower = raw.trim().toLowerCase();
  if (LINE_STYLES.has(lower)) {
    return lower as LineStyle;
  }
  return "none";
}

/** Parse rule-break longhand value. */
export function parseRuleBreak(value: string): RuleBreak | null {
  const v = value.trim().toLowerCase();
  return RULE_BREAK_VALUES.has(v) ? (v as RuleBreak) : null;
}

/** Parse rule-visibility-items longhand value. */
export function parseVisibilityItems(
  value: string,
): RuleVisibilityItems | null {
  const v = value.trim().toLowerCase();
  return VISIBILITY_VALUES.has(v) ? (v as RuleVisibilityItems) : null;
}

/** Parse rule-overlap longhand value. */
export function parseRuleOverlap(value: string): RuleOverlap | null {
  const v = value.trim().toLowerCase();
  return OVERLAP_VALUES.has(v) ? (v as RuleOverlap) : null;
}

/** Parse an inset longhand value: <length-percentage> | overlap-join */
export function parseInsetValue(value: string): InsetValue | null {
  const v = value.trim().toLowerCase();
  if (v === "overlap-join") {
    return { type: "keyword", value: "overlap-join" };
  }

  // percentage
  if (v.endsWith("%")) {
    const num = parseFloat(v);
    if (!Number.isNaN(num)) {
      return { type: "percentage", value: num };
    }
    return null;
  }

  // length
  const px = parseLengthToPx(v);
  if (px !== null) {
    return { type: "length", value: px };
  }

  return null;
}

/**
 * Parse an inset shorthand: <v> <v>? [ / <v> <v>? ]?
 * where the part before / is cap, after / is junction.
 * If no /, junction = cap.
 */
export function parseInsetShorthand(value: string): {
  capStart: InsetValue;
  capEnd: InsetValue;
  junctionStart: InsetValue;
  junctionEnd: InsetValue;
} | null {
  const slashParts = value.split("/").map((s) => s.trim());
  if (slashParts.length > 2) {
    return null;
  }

  const capPart = slashParts[0];
  const junctionPart = slashParts.length > 1 ? slashParts[1] : null;

  // Parse cap pair
  const capTokens = capPart.split(/\s+/).filter(Boolean);
  if (capTokens.length === 0 || capTokens.length > 2) {
    return null;
  }

  const capStart = parseInsetValue(capTokens[0]);
  if (!capStart) {
    return null;
  }
  const capEnd =
    capTokens.length > 1 ? parseInsetValue(capTokens[1]) : { ...capStart };
  if (!capEnd) {
    return null;
  }

  // Parse junction pair (or copy from cap)
  let junctionStart: InsetValue;
  let junctionEnd: InsetValue;

  if (junctionPart) {
    const jTokens = junctionPart.split(/\s+/).filter(Boolean);
    if (jTokens.length === 0 || jTokens.length > 2) {
      return null;
    }
    const js = parseInsetValue(jTokens[0]);
    if (!js) {
      return null;
    }
    junctionStart = js;
    if (jTokens.length > 1) {
      const je = parseInsetValue(jTokens[1]);
      if (!je) {
        return null;
      }
      junctionEnd = je;
    } else {
      junctionEnd = { ...js };
    }
  } else {
    junctionStart = { ...capStart };
    junctionEnd = { ...capEnd };
  }

  return { capStart, capEnd, junctionStart, junctionEnd };
}

// ---- Shorthand decomposition ----

/**
 * Assign one value to the per-axis longhands of a rule sub-property for
 * the given axes.
 */
function setRuleLonghands(
  result: Map<LonghandName, unknown>,
  axes: ("column" | "row")[],
  suffix: string,
  value: unknown,
): void {
  for (const axis of axes) {
    result.set(`${axis}-rule-${suffix}` as LonghandName, value);
  }
}

/**
 * Decompose a shorthand declaration into longhand name→value pairs.
 * Returns null if the value cannot be parsed for this shorthand.
 */
export function decomposeShorthand(
  shorthand: string,
  value: string,
): Map<LonghandName, unknown> | null {
  const result = new Map<LonghandName, unknown>();

  // rule, column-rule, row-rule: <gap-rule-list> → width/style/color
  if (
    shorthand === "rule" ||
    shorthand === "column-rule" ||
    shorthand === "row-rule"
  ) {
    const parsed = parseRuleShorthand(value);
    if (!parsed) {
      return null;
    }
    const axes: ("column" | "row")[] =
      shorthand === "rule"
        ? ["column", "row"]
        : [shorthand === "column-rule" ? "column" : "row"];
    setRuleLonghands(result, axes, "width", parsed.widths);
    setRuleLonghands(result, axes, "style", parsed.styles);
    setRuleLonghands(result, axes, "color", parsed.colors);
    return result;
  }

  // rule-color, rule-style, rule-width: single value list → both axes
  if (shorthand === "rule-color") {
    const list = parseColorList(value);
    if (!list) {
      return null;
    }
    setRuleLonghands(result, ["column", "row"], "color", list);
    return result;
  }
  if (shorthand === "rule-style") {
    const list = parseStyleList(value);
    if (!list) {
      return null;
    }
    setRuleLonghands(result, ["column", "row"], "style", list);
    return result;
  }
  if (shorthand === "rule-width") {
    const list = parseWidthList(value);
    if (!list) {
      return null;
    }
    setRuleLonghands(result, ["column", "row"], "width", list);
    return result;
  }

  // rule-break: single keyword → both axes
  if (shorthand === "rule-break") {
    const v = parseRuleBreak(value);
    if (!v) {
      return null;
    }
    setRuleLonghands(result, ["column", "row"], "break", v);
    return result;
  }

  // rule-visibility-items: single keyword → both axes
  if (shorthand === "rule-visibility-items") {
    const v = parseVisibilityItems(value);
    if (!v) {
      return null;
    }
    setRuleLonghands(result, ["column", "row"], "visibility-items", v);
    return result;
  }

  // Inset shorthands
  return decomposeInsetShorthand(shorthand, value);
}

function decomposeInsetShorthand(
  shorthand: string,
  value: string,
): Map<LonghandName, unknown> | null {
  const result = new Map<LonghandName, unknown>();
  const def = SHORTHANDS[shorthand];
  if (!def) {
    return null;
  }

  // column-rule-inset / row-rule-inset: <cap-start> <cap-end>? [ / <junction-start> <junction-end>? ]?
  if (shorthand === "column-rule-inset" || shorthand === "row-rule-inset") {
    const parsed = parseInsetShorthand(value);
    if (!parsed) {
      return null;
    }
    const prefix = shorthand === "column-rule-inset" ? "column" : "row";
    result.set(
      `${prefix}-rule-inset-cap-start` as LonghandName,
      parsed.capStart,
    );
    result.set(`${prefix}-rule-inset-cap-end` as LonghandName, parsed.capEnd);
    result.set(
      `${prefix}-rule-inset-junction-start` as LonghandName,
      parsed.junctionStart,
    );
    result.set(
      `${prefix}-rule-inset-junction-end` as LonghandName,
      parsed.junctionEnd,
    );
    return result;
  }

  if (shorthand === "rule-inset") {
    const parsed = parseInsetShorthand(value);
    if (!parsed) {
      return null;
    }
    for (const prefix of ["column", "row"]) {
      result.set(
        `${prefix}-rule-inset-cap-start` as LonghandName,
        parsed.capStart,
      );
      result.set(`${prefix}-rule-inset-cap-end` as LonghandName, parsed.capEnd);
      result.set(
        `${prefix}-rule-inset-junction-start` as LonghandName,
        parsed.junctionStart,
      );
      result.set(
        `${prefix}-rule-inset-junction-end` as LonghandName,
        parsed.junctionEnd,
      );
    }
    return result;
  }

  // cap / junction pair shorthands: <start> <end>?
  if (shorthand.endsWith("-cap") || shorthand.endsWith("-junction")) {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 2) {
      return null;
    }
    const startVal = parseInsetValue(tokens[0]);
    if (!startVal) {
      return null;
    }
    const endVal =
      tokens.length > 1 ? parseInsetValue(tokens[1]) : { ...startVal };
    if (!endVal) {
      return null;
    }

    // Set all longhands in this shorthand's list: first half = start, second half = end
    const lh = def.longhands;
    // Longhands are listed as: ...start..., ...end... (alternating by axis for bidirectional)
    // For per-axis: [start, end]
    // For bidirectional: [col-start, col-end, row-start, row-end]
    if (lh.length === 2) {
      result.set(lh[0], startVal);
      result.set(lh[1], endVal);
    } else if (lh.length === 4) {
      result.set(lh[0], startVal); // col-start
      result.set(lh[1], endVal); // col-end
      result.set(lh[2], startVal); // row-start
      result.set(lh[3], endVal); // row-end
    }
    return result;
  }

  // start / end shorthands: single value → both cap and junction (start or end)
  if (shorthand.endsWith("-start") || shorthand.endsWith("-end")) {
    const parsed = parseInsetValue(value);
    if (!parsed) {
      return null;
    }
    for (const lh of def.longhands) {
      result.set(lh, { ...parsed });
    }
    return result;
  }

  return null;
}

// ---- Utility functions ----

/** Strip CSS comments from a string. */
function stripComments(css: string): string {
  let result = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
    } else if (css[i] === '"' || css[i] === "'") {
      const quote = css[i];
      let j = i + 1;
      while (j < css.length && css[j] !== quote) {
        if (css[j] === "\\") {
          j++;
        }
        j++;
      }
      result += css.slice(i, j + 1);
      i = j + 1;
    } else {
      result += css[i];
      i++;
    }
  }
  return result;
}

/**
 * Walk top-level and nested rule blocks in CSS text (comments already stripped).
 * Calls `callback(selector, body)` for each style rule found, recursing into @-rule blocks.
 */
function walkRuleBlocks(
  css: string,
  callback: (selector: string, body: string) => void,
): void {
  let i = 0;
  while (i < css.length) {
    // Skip whitespace
    while (i < css.length && /\s/.test(css[i])) {
      i++;
    }
    if (i >= css.length) {
      break;
    }

    // Find the next '{' — everything before it is the selector or @-rule prelude
    const braceIdx = indexOfTopLevel(css, "{", i);
    if (braceIdx === -1) {
      break;
    }

    const prelude = css.slice(i, braceIdx).trim();
    const blockEnd = findMatchingBrace(css, braceIdx);
    if (blockEnd === -1) {
      break;
    }

    const body = css.slice(braceIdx + 1, blockEnd);

    if (prelude.startsWith("@")) {
      // Recurse into @-rule blocks (e.g. @media, @supports, @layer)
      walkRuleBlocks(body, callback);
    } else if (prelude) {
      callback(prelude, body);
    }

    i = blockEnd + 1;
  }
}

/** Find the index of `ch` at the top level (not inside strings or parens). */
function indexOfTopLevel(css: string, ch: string, start: number): number {
  let parenDepth = 0;
  for (let i = start; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < css.length && css[i] !== q) {
        if (css[i] === "\\") {
          i++;
        }
        i++;
      }
    } else if (c === "(") {
      parenDepth++;
    } else if (c === ")") {
      parenDepth--;
    } else if (c === ch && parenDepth === 0) {
      return i;
    }
  }
  return -1;
}

/** Find the matching '}' for a '{' at `openIdx`. */
function findMatchingBrace(css: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < css.length && css[i] !== q) {
        if (css[i] === "\\") {
          i++;
        }
        i++;
      }
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

interface RawDeclaration {
  property: string;
  value: string;
  important: boolean;
}

/** Parse a CSS declaration block (content between `{` and `}`) into declarations. */
function parseDeclarationBlock(body: string): RawDeclaration[] {
  const declarations: RawDeclaration[] = [];
  // Split on top-level semicolons (not inside parens or strings)
  const parts = splitTopLevel(body, ";");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    // Find the colon separating property from value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }

    const property = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Check for !important
    let important = false;
    const importantMatch = value.match(/\s*!important\s*$/i);
    if (importantMatch) {
      important = true;
      value = value.slice(0, value.length - importantMatch[0].length).trim();
    }

    if (property && value) {
      declarations.push({ property, value, important });
    }
  }

  return declarations;
}

/** Split a string on a delimiter at the top level (not inside parens or strings). */
function splitTopLevel(str: string, delim: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < str.length && str[i] !== q) {
        if (str[i] === "\\") {
          i++;
        }
        i++;
      }
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === delim && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/**
 * Split a CSS value into space-separated tokens, keeping functional notation
 * (e.g. `rgb(0, 0, 255)`) as single tokens.
 */
function splitValueTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

/** Split a string on top-level commas (not nested in parens). */
export function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

/** Extract contents between matching parens starting at `openIndex`. */
function extractParenContents(str: string, openIndex: number): string | null {
  if (str[openIndex] !== "(") {
    return null;
  }
  let depth = 1;
  for (let i = openIndex + 1; i < str.length; i++) {
    if (str[i] === "(") {
      depth++;
    } else if (str[i] === ")") {
      depth--;
      if (depth === 0) {
        return str.slice(openIndex + 1, i);
      }
    }
  }
  return null;
}

/** Parse a CSS length to px (only px and bare 0 for now; others resolve at paint time). */
export function parseLengthToPx(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "0") {
    return 0;
  }

  const match = trimmed.match(/^(-?\d+\.?\d*|-?\.\d+)(px)?$/);
  if (match && (match[2] === "px" || !match[2])) {
    return parseFloat(match[1]);
  }

  // For other units, store the raw value — resolve at paint time using
  // the element's computed font size etc. For now, try px conversion
  // for common units:
  const dimMatch = trimmed.match(
    /^(-?\d+\.?\d*|-?\.\d+)(px|pt|pc|in|cm|mm|q)$/,
  );
  if (dimMatch) {
    const num = parseFloat(dimMatch[1]);
    switch (dimMatch[2]) {
      case "px":
        return num;
      case "pt":
        return num * (4 / 3);
      case "pc":
        return num * 16;
      case "in":
        return num * 96;
      case "cm":
        return num * (96 / 2.54);
      case "mm":
        return num * (96 / 25.4);
      case "q":
        return num * (96 / 101.6);
    }
  }

  return null;
}

/**
 * Compute selector specificity as [id, class, type].
 * Simplified — correct for the common patterns used in WPTs.
 */
function computeSpecificity(selector: string): [number, number, number] {
  // Strip :where(...) — zero specificity
  const s = selector.replace(/:where\([^)]*\)/g, "");
  // Count #ids
  const ids = (s.match(/#[a-zA-Z_-][\w-]*/g) || []).length;
  // Count .classes, [attrs], :pseudo-classes (except :where)
  const classes =
    (s.match(/\.[a-zA-Z_-][\w-]*/g) || []).length +
    (s.match(/\[[^\]]*\]/g) || []).length +
    (s.match(/:[a-zA-Z_-][\w-]*/g) || []).length;
  // Count type selectors
  const types = (s.match(/(^|[\s+>~])[\w-]+/g) || []).length;

  return [ids, classes, types];
}
