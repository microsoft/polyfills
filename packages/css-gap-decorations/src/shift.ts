/**
 * Shift engine — the "custom-property rename" cascade strategy.
 *
 * Instead of re-implementing the CSS cascade (specificity, source order,
 * !important, @layer, var()) in JavaScript, the polyfill rewrites every
 * gap-decoration declaration into a parallel custom property named
 * `--gdp-<longhand>` and lets the browser's native engine resolve the cascade.
 * The resolved values are read back with getComputedStyle.
 *
 * The custom properties are registered via `@property { syntax: "*";
 * inherits: false }` so they (a) do NOT inherit (gap decorations are not
 * inherited, unlike custom properties by default) and (b) still resolve var()
 * references at computed-value time.
 */

import type { ParsedDeclaration } from "./parse.js";
import {
  decomposeShorthand,
  parseColorList,
  parseInlineStyle,
  parseInsetValue,
  parseRuleBreak,
  parseRuleOverlap,
  parseStyleList,
  parseVisibilityItems,
  parseWidthList,
} from "./parse.js";
import {
  type ComputedGapStyles,
  type GapDataList,
  getInitialComputedStyles,
  LONGHANDS,
  type LonghandName,
  SHORTHANDS,
} from "./properties.js";

/** Prefix for the shifted custom properties. */
const GDP_PREFIX = "--gdp-";

/** The custom-property name a longhand is shifted into. */
function shiftedName(longhand: LonghandName): string {
  return `${GDP_PREFIX}${longhand}`;
}

// ---- Longhand expansion (shared by stylesheet build and inline) ----

/** Expand a parsed declaration into typed longhand name/value pairs. */
function expandToLonghands(decl: {
  property: string;
  value: string;
}): { property: LonghandName; value: unknown }[] | null {
  const { property, value } = decl;

  if (property in LONGHANDS) {
    const parsed = parseLonghandValue(property as LonghandName, value);
    if (parsed === null) {
      return null;
    }
    return [{ property: property as LonghandName, value: parsed }];
  }

  if (property in SHORTHANDS) {
    const decomposed = decomposeShorthand(property, value);
    if (!decomposed) {
      return null;
    }
    return Array.from(decomposed.entries()).map(([name, val]) => ({
      property: name,
      value: val,
    }));
  }

  return null;
}

/** Parse a longhand value string into its typed representation. */
function parseLonghandValue(property: LonghandName, value: string): unknown {
  const def = LONGHANDS[property];
  switch (def.type) {
    case "color-list":
      return parseColorList(value);
    case "style-list":
      return parseStyleList(value);
    case "width-list":
      return parseWidthList(value);
    case "keyword": {
      if (property === "column-rule-break" || property === "row-rule-break") {
        return parseRuleBreak(value);
      }
      if (
        property === "column-rule-visibility-items" ||
        property === "row-rule-visibility-items"
      ) {
        return parseVisibilityItems(value);
      }
      if (property === "rule-overlap") {
        return parseRuleOverlap(value);
      }
      return null;
    }
    case "inset":
      return parseInsetValue(value);
    default:
      return null;
  }
}

// ---- Serialization (typed value -> canonical CSS text) ----

function serializeScalar(type: LonghandDefType, value: unknown): string {
  if (type === "width-list") {
    return `${value as number}px`;
  }
  // color-list and style-list scalars are already CSS-text strings.
  return String(value);
}

function serializeList(
  type: LonghandDefType,
  list: GapDataList<unknown>,
): string {
  return list
    .map((item) => {
      if (item.isRepeat) {
        const vals = item.values
          .map((v) => serializeScalar(type, v))
          .join(", ");
        return `repeat(${item.count}, ${vals})`;
      }
      return serializeScalar(type, item.value);
    })
    .join(", ");
}

type LonghandDefType = (typeof LONGHANDS)[LonghandName]["type"];

// ---- @property registrations ----

let cachedRegistrations: string | null = null;

/** Typed syntax for the inset longhands (resolves calc()/units, validates). */
const INSET_SYNTAX = "<length-percentage> | overlap-join";

/** Typed enum syntaxes for the keyword longhands. */
const KEYWORD_SYNTAX: Partial<Record<LonghandName, string>> = {
  "column-rule-break": "none | normal | intersection",
  "row-rule-break": "none | normal | intersection",
  "column-rule-visibility-items": "normal | between | around | all",
  "row-rule-visibility-items": "normal | between | around | all",
  "rule-overlap": "row-over-column | column-over-row",
};

/**
 * `@property` registrations for every shifted custom property. All are
 * `inherits: false` so they don't inherit (gap decorations aren't inherited).
 *
 * - Inset and keyword longhands use *specific* syntaxes so the native engine
 *   validates them and resolves calc()/units/percentages; their author values
 *   are injected as raw text and a matching `initial-value` reproduces the
 *   polyfill's default when unset or invalid.
 * - The color/style/width *list* longhands keep `syntax: "*"` because the
 *   gap-decoration `repeat()` grammar cannot be expressed as a registered
 *   syntax; those are parsed and re-serialized by the polyfill.
 */
function getRegistrations(): string {
  if (cachedRegistrations !== null) {
    return cachedRegistrations;
  }
  const rules: string[] = [];
  for (const name of Object.keys(LONGHANDS) as LonghandName[]) {
    const def = LONGHANDS[name];
    let body: string;
    if (def.type === "inset") {
      body = `syntax: "${INSET_SYNTAX}"; inherits: false; initial-value: 0px;`;
    } else if (def.type === "keyword") {
      body = `syntax: "${KEYWORD_SYNTAX[name]}"; inherits: false; initial-value: ${String(def.initial)};`;
    } else {
      body = `syntax: "*"; inherits: false;`;
    }
    rules.push(`@property ${shiftedName(name)} { ${body} }`);
  }
  cachedRegistrations = rules.join("\n");
  return cachedRegistrations;
}

// ---- Inline gap-decoration discovery ----

let inlineMarkerCounter = 0;
const INLINE_MARKER_ATTR = "data-gdp-inline";

/** Convert a CSS property name like 'row-rule-color' to camelCase. */
function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Collect the inline (style attribute + JS-set style object) gap-decoration
 * declarations of an element as raw property/value/important triples.
 */
function collectInlineDeclarations(
  el: HTMLElement,
): { property: string; value: string; important: boolean }[] {
  const result: { property: string; value: string; important: boolean }[] = [];

  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    for (const [propName, { value, important }] of parseInlineStyle(
      styleAttr,
    )) {
      result.push({ property: propName, value, important });
    }
  }

  // Also probe the style object for JS-set values a UA may not serialize.
  const elStyle = el.style as unknown as Record<string, string>;
  for (const propName of [
    ...Object.keys(LONGHANDS),
    ...Object.keys(SHORTHANDS),
  ]) {
    if (result.some((d) => d.property === propName)) {
      continue;
    }
    const camel = toCamelCase(propName);
    const value = elStyle[camel];
    if (value && typeof value === "string" && value !== "") {
      result.push({ property: propName, value, important: false });
    }
  }

  return result;
}

/** Quick check whether a style attribute string mentions a gap-decoration rule. */
function hasGapDecorationInStyle(styleText: string): boolean {
  const lower = styleText.toLowerCase();
  return lower.includes("rule-") || lower.includes("rule:");
}

/** Quick check whether an element's style object has any gap-decoration prop. */
function hasGapDecorationInStyleObject(el: HTMLElement): boolean {
  const s = el.style as unknown as Record<string, string>;
  return !!(
    s.columnRuleColor ||
    s.columnRuleStyle ||
    s.columnRuleWidth ||
    s.rowRuleColor ||
    s.rowRuleStyle ||
    s.rowRuleWidth ||
    s.columnRule ||
    s.rowRule ||
    s.ruleColor ||
    s.ruleStyle ||
    s.ruleWidth
  );
}

/** Find elements carrying inline gap-decoration declarations. */
export function collectInlineGapElements(
  root: Document | Element = document,
): HTMLElement[] {
  const out: HTMLElement[] = [];
  const candidates = root.querySelectorAll<HTMLElement>("[style]");
  for (const el of candidates) {
    const styleAttr = el.getAttribute("style") || "";
    if (
      hasGapDecorationInStyle(styleAttr) ||
      hasGapDecorationInStyleObject(el)
    ) {
      out.push(el);
    }
  }
  return out;
}

// ---- Shifted stylesheet construction ----

// ---- Per-longhand injected text (raw for typed props, serialized for lists) ----

type InjectedDecl = { property: LonghandName; text: string };

/** Categorize a property by the value grammar of its (first) longhand. */
function valueCategory(property: string): "list" | "keyword" | "inset" | null {
  let t: LonghandDefType | undefined;
  if (property in LONGHANDS) {
    t = LONGHANDS[property as LonghandName].type;
  } else if (property in SHORTHANDS) {
    t = LONGHANDS[SHORTHANDS[property].longhands[0]].type;
  }
  if (!t) {
    return null;
  }
  if (t === "color-list" || t === "style-list" || t === "width-list") {
    return "list";
  }
  return t;
}

/** Raw text for keyword longhand / shorthand declarations (browser validates). */
function rawKeywordDecls(decl: {
  property: string;
  value: string;
}): InjectedDecl[] | null {
  const raw = decl.value.trim();
  if (!raw) {
    return null;
  }
  if (decl.property in LONGHANDS) {
    return [{ property: decl.property as LonghandName, text: raw }];
  }
  const sh = SHORTHANDS[decl.property];
  if (!sh) {
    return null;
  }
  return sh.longhands.map((lh) => ({ property: lh, text: raw }));
}

/** Split an inset shorthand `<cs> <ce>? [ / <js> <je>? ]?` into raw strings. */
function splitInsetShorthand(value: string): {
  capStart: string;
  capEnd: string;
  junctionStart: string;
  junctionEnd: string;
} | null {
  const slashParts = value.split("/").map((s) => s.trim());
  if (slashParts.length > 2) {
    return null;
  }
  const capTokens = slashParts[0].split(/\s+/).filter(Boolean);
  if (capTokens.length === 0 || capTokens.length > 2) {
    return null;
  }
  const capStart = capTokens[0];
  const capEnd = capTokens[1] ?? capStart;

  if (slashParts.length > 1) {
    const jt = slashParts[1].split(/\s+/).filter(Boolean);
    if (jt.length === 0 || jt.length > 2) {
      return null;
    }
    return {
      capStart,
      capEnd,
      junctionStart: jt[0],
      junctionEnd: jt[1] ?? jt[0],
    };
  }
  return { capStart, capEnd, junctionStart: capStart, junctionEnd: capEnd };
}

/** Raw text for inset longhand / shorthand declarations (browser resolves). */
function rawInsetDecls(decl: {
  property: string;
  value: string;
}): InjectedDecl[] | null {
  const raw = decl.value.trim();
  if (!raw) {
    return null;
  }
  if (decl.property in LONGHANDS) {
    return [{ property: decl.property as LonghandName, text: raw }];
  }

  const def = SHORTHANDS[decl.property];
  if (!def) {
    return null;
  }
  const result: InjectedDecl[] = [];

  // `<axis>-rule-inset` / `rule-inset`: cap/junction start/end positions.
  if (
    decl.property === "column-rule-inset" ||
    decl.property === "row-rule-inset" ||
    decl.property === "rule-inset"
  ) {
    const s = splitInsetShorthand(raw);
    if (!s) {
      return null;
    }
    const prefixes =
      decl.property === "rule-inset"
        ? ["column", "row"]
        : [decl.property === "column-rule-inset" ? "column" : "row"];
    for (const p of prefixes) {
      result.push(
        {
          property: `${p}-rule-inset-cap-start` as LonghandName,
          text: s.capStart,
        },
        { property: `${p}-rule-inset-cap-end` as LonghandName, text: s.capEnd },
        {
          property: `${p}-rule-inset-junction-start` as LonghandName,
          text: s.junctionStart,
        },
        {
          property: `${p}-rule-inset-junction-end` as LonghandName,
          text: s.junctionEnd,
        },
      );
    }
    return result;
  }

  // cap / junction pair shorthands: `<start> <end>?`.
  if (decl.property.endsWith("-cap") || decl.property.endsWith("-junction")) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 2) {
      return null;
    }
    const start = tokens[0];
    const end = tokens[1] ?? tokens[0];
    const lh = def.longhands;
    if (lh.length === 2) {
      result.push(
        { property: lh[0], text: start },
        { property: lh[1], text: end },
      );
    } else if (lh.length === 4) {
      result.push(
        { property: lh[0], text: start },
        { property: lh[1], text: end },
        { property: lh[2], text: start },
        { property: lh[3], text: end },
      );
    }
    return result;
  }

  // start / end shorthands: single value applied to all longhands.
  if (decl.property.endsWith("-start") || decl.property.endsWith("-end")) {
    for (const lh of def.longhands) {
      result.push({ property: lh, text: raw });
    }
    return result;
  }

  return null;
}

/**
 * Expand a declaration into the per-longhand text to inject into the shifted
 * custom properties. List properties are parsed and re-serialized (repeat()
 * grammar isn't a registrable syntax); inset and keyword properties inject the
 * raw author text so the natively-registered `@property` resolves and validates
 * them.
 */
function expandToInjectedDecls(decl: {
  property: string;
  value: string;
}): InjectedDecl[] | null {
  const cat = valueCategory(decl.property);
  if (cat === null) {
    return null;
  }
  if (cat === "keyword") {
    return rawKeywordDecls(decl);
  }
  if (cat === "inset") {
    return rawInsetDecls(decl);
  }
  // list
  const expanded = expandToLonghands(decl);
  if (!expanded) {
    return null;
  }
  return expanded.map((lh) => ({
    property: lh.property,
    text: serializeList(
      LONGHANDS[lh.property].type,
      lh.value as GapDataList<unknown>,
    ),
  }));
}

/** Build the `selector { --gdp-*: ...; }` text for one set of longhands. */
function buildDeclBlock(
  decls: { property: LonghandName; text: string }[],
  important: boolean,
): string {
  const bang = important ? " !important" : "";
  return decls
    .map((d) => `${shiftedName(d.property)}: ${d.text}${bang};`)
    .join(" ");
}

/** Wrap a rule string in its enclosing at-rule preludes (outermost first). */
function wrapInAtRules(rule: string, atRules: string[]): string {
  let out = rule;
  for (let k = atRules.length - 1; k >= 0; k--) {
    out = `${atRules[k]} { ${out} }`;
  }
  return out;
}

/**
 * Build the full shifted stylesheet text from parsed stylesheet declarations,
 * layer ordering statements, and inline gap-decoration elements.
 *
 * The output preserves the original conditional / layer context and source
 * order so the native cascade reproduces the author's intended result among the
 * `--gdp-*` custom properties.
 */
export function buildShiftedStylesheet(
  declarations: ParsedDeclaration[],
  layerStatements: string[],
  inlineEls: HTMLElement[],
): string {
  const parts: string[] = [getRegistrations()];

  // Preserve layer ordering statements (deduped, first occurrence wins).
  const seenLayers = new Set<string>();
  for (const stmt of layerStatements) {
    const normalized = stmt.replace(/\s+/g, " ").trim();
    if (!seenLayers.has(normalized)) {
      seenLayers.add(normalized);
      parts.push(`${stmt};`);
    }
  }

  // Stylesheet declarations, in source order.
  const sorted = [...declarations].sort(
    (a, b) => a.sourceOrder - b.sourceOrder,
  );
  for (const decl of sorted) {
    const injected = expandToInjectedDecls(decl);
    if (!injected || injected.length === 0) {
      continue;
    }
    const block = `${decl.selector} { ${buildDeclBlock(injected, decl.important)} }`;
    parts.push(wrapInAtRules(block, decl.atRules));
  }

  // Inline declarations, emitted last via marker-attribute selectors so they
  // take precedence over normal stylesheet rules (approximating inline
  // priority). Each inline element gets a stable marker id.
  for (const el of inlineEls) {
    let marker = el.getAttribute(INLINE_MARKER_ATTR);
    if (!marker) {
      marker = String(inlineMarkerCounter++);
      el.setAttribute(INLINE_MARKER_ATTR, marker);
    }
    const inlineDecls = collectInlineDeclarations(el);
    const injected: InjectedDecl[] = [];
    let important = false;
    for (const d of inlineDecls) {
      const expanded = expandToInjectedDecls(d);
      if (expanded) {
        injected.push(...expanded);
        if (d.important) {
          important = true;
        }
      }
    }
    if (injected.length === 0) {
      continue;
    }
    parts.push(
      `[${INLINE_MARKER_ATTR}="${marker}"] { ${buildDeclBlock(injected, important)} }`,
    );
  }

  return parts.join("\n");
}

// ---- Reading resolved values ----

/**
 * Read the natively-cascaded gap-decoration styles for an element by querying
 * the resolved `--gdp-*` custom properties via getComputedStyle. Unset
 * properties (empty computed value) fall back to their initial values.
 */
export function readComputedGapStyles(el: Element): ComputedGapStyles {
  const cs = getComputedStyle(el);
  const styles = getInitialComputedStyles();
  for (const name of Object.keys(LONGHANDS) as LonghandName[]) {
    const raw = cs.getPropertyValue(shiftedName(name)).trim();
    if (!raw) {
      continue;
    }
    const parsed = parseLonghandValue(name, raw);
    if (parsed !== null) {
      (styles as unknown as Record<string, unknown>)[name] = parsed;
    }
  }
  return styles;
}
