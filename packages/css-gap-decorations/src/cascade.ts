/**
 * Cascade resolver — matches selectors to elements, resolves
 * specificity, applies shorthand expansion, stores computed
 * gap-decoration styles per element.
 */

import {
  decomposeShorthand,
  type ParsedDeclaration,
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
  getInitialComputedStyles,
  LONGHANDS,
  type LonghandName,
  SHORTHANDS,
} from "./properties.js";

/** Per-element computed gap styles. */
const elementStyles = new WeakMap<Element, ComputedGapStyles>();

/** Get or create computed gap styles for an element. */
export function getComputedGapStyles(el: Element): ComputedGapStyles {
  let styles = elementStyles.get(el);
  if (!styles) {
    styles = getInitialComputedStyles();
    elementStyles.set(el, styles);
  }
  return styles;
}

/** Clear computed styles for an element (on style recalc). */
export function clearComputedGapStyles(el: Element): void {
  elementStyles.delete(el);
}

/**
 * Re-resolve styles for a single element, applying both stylesheet
 * declarations and inline styles. Used when a container's attributes change.
 */
export function resolveElementStyles(
  el: Element,
  declarations: ParsedDeclaration[],
): void {
  const containerType = detectContainerType(el);
  if (!containerType) {
    return;
  }

  const decls: ResolvedDeclaration[] = [];

  for (const decl of declarations) {
    try {
      if (!el.matches(decl.selector)) {
        continue;
      }
    } catch {
      continue;
    }

    const longhands = expandToLonghands(decl);
    if (!longhands) {
      continue;
    }

    for (const lh of longhands) {
      decls.push({
        ...lh,
        specificity: decl.specificity,
        sourceOrder: decl.sourceOrder,
        important: decl.important,
      });
    }
  }

  decls.sort((a, b) => {
    if (a.important !== b.important) {
      return a.important ? 1 : -1;
    }
    for (let i = 0; i < 3; i++) {
      if (a.specificity[i] !== b.specificity[i]) {
        return a.specificity[i] - b.specificity[i];
      }
    }
    return a.sourceOrder - b.sourceOrder;
  });

  const styles = getInitialComputedStyles();

  for (const decl of decls) {
    const def = LONGHANDS[decl.property];
    if (!def) {
      continue;
    }
    (styles as unknown as Record<string, unknown>)[decl.property] = decl.value;
  }

  applyInlineStyles(el, styles);
  elementStyles.set(el, styles);
}

/** Get the WeakMap directly (for observer cleanup). */
export function getStyleMap(): WeakMap<Element, ComputedGapStyles> {
  return elementStyles;
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

interface ResolvedDeclaration {
  property: LonghandName;
  value: unknown;
  specificity: [number, number, number];
  sourceOrder: number;
  important: boolean;
}

/**
 * Resolve all gap-decoration styles for elements matched by the given
 * declarations. Returns the set of elements that have gap styles.
 */
export function resolveStyles(
  declarations: ParsedDeclaration[],
  root: Document | Element = document,
): Set<Element> {
  // Group declarations that will become longhands, matched to elements
  const elementDecls = new Map<Element, ResolvedDeclaration[]>();

  for (const decl of declarations) {
    let elements: NodeListOf<Element>;
    try {
      elements = root.querySelectorAll(decl.selector);
    } catch {
      continue; // invalid selector
    }

    // Expand to longhands
    const longhands = expandToLonghands(decl);
    if (!longhands) {
      continue;
    }

    for (const el of elements) {
      let list = elementDecls.get(el);
      if (!list) {
        list = [];
        elementDecls.set(el, list);
      }
      for (const lh of longhands) {
        list.push({
          ...lh,
          specificity: decl.specificity,
          sourceOrder: decl.sourceOrder,
          important: decl.important,
        });
      }
    }
  }

  // For each element, sort by cascade priority and apply
  const styledElements = new Set<Element>();

  for (const [el, decls] of elementDecls) {
    const containerType = detectContainerType(el);
    if (!containerType) {
      continue; // not a gap container
    }

    // Sort: !important first, then specificity (descending), then source order (descending)
    // Last applicable value wins → we want to apply in ascending priority order
    decls.sort((a, b) => {
      // important beats non-important
      if (a.important !== b.important) {
        return a.important ? 1 : -1;
      }
      // higher specificity wins
      for (let i = 0; i < 3; i++) {
        if (a.specificity[i] !== b.specificity[i]) {
          return a.specificity[i] - b.specificity[i];
        }
      }
      // later source order wins
      return a.sourceOrder - b.sourceOrder;
    });

    const styles = getInitialComputedStyles();

    for (const decl of decls) {
      const def = LONGHANDS[decl.property];
      if (!def) {
        continue;
      }
      (styles as unknown as Record<string, unknown>)[decl.property] =
        decl.value;
    }

    // Apply inline styles (highest priority for non-!important)
    applyInlineStyles(el, styles);

    elementStyles.set(el, styles);
    styledElements.add(el);
  }

  // Also discover containers that only have inline gap-decoration styles
  // (not matched by any stylesheet selector). Check both the serialized
  // style attribute and the style object (for properties a UA may not
  // serialize back to the attribute, like row-rule-* set via JS).
  const allContainers = root.querySelectorAll
    ? root.querySelectorAll("[style]")
    : [];
  for (const el of allContainers) {
    if (styledElements.has(el)) {
      continue;
    }
    const styleAttr = el.getAttribute("style") || "";
    if (
      !hasGapDecorationInStyle(styleAttr) &&
      !hasGapDecorationInStyleObject(el as HTMLElement)
    ) {
      continue;
    }
    const containerType = detectContainerType(el);
    if (!containerType) {
      continue;
    }
    const styles = getInitialComputedStyles();
    applyInlineStyles(el, styles);
    elementStyles.set(el, styles);
    styledElements.add(el);
  }

  return styledElements;
}

/**
 * Expand a parsed declaration into longhand name/value pairs.
 */
function expandToLonghands(
  decl: ParsedDeclaration,
): { property: LonghandName; value: unknown }[] | null {
  const { property, value } = decl;

  // If it's a longhand, parse the value directly
  if (property in LONGHANDS) {
    const parsed = parseLonghandValue(property as LonghandName, value);
    if (parsed === null) {
      return null;
    }
    return [{ property: property as LonghandName, value: parsed }];
  }

  // If it's a shorthand, decompose
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

/**
 * Parse a longhand value string into its typed representation.
 */
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

/**
 * Apply inline styles from an element's style attribute to its computed gap styles.
 * Also reads gap decoration properties directly from the CSSStyleDeclaration
 * object: a user agent that doesn't implement a given gap decoration property
 * is not required to serialize it back to the style attribute, so a value set
 * via JavaScript (e.g. el.style.rowRuleColor = 'red') may only be observable on
 * the style object itself.
 */
function applyInlineStyles(el: Element, styles: ComputedGapStyles): void {
  const styleAttr = el.getAttribute("style");
  if (styleAttr) {
    const inlineDecls = parseInlineStyle(styleAttr);
    for (const [propName, { value }] of inlineDecls) {
      // Check if it's a longhand
      if (propName in LONGHANDS) {
        const parsed = parseLonghandValue(propName as LonghandName, value);
        if (parsed !== null) {
          (styles as unknown as Record<string, unknown>)[propName] = parsed;
        }
      }
      // Check if it's a shorthand
      else if (propName in SHORTHANDS) {
        const decomposed = decomposeShorthand(propName, value);
        if (!decomposed) {
          continue;
        }
        for (const [lhName, lhValue] of decomposed) {
          (styles as unknown as Record<string, unknown>)[lhName] = lhValue;
        }
      }
    }
  }

  // Also probe the CSSStyleDeclaration object directly for values set via JS
  // that the user agent may not serialize back to the style attribute.
  applyStyleObjectProperties(el as HTMLElement, styles);
}

/** Convert a CSS property name like 'row-rule-color' to camelCase 'rowRuleColor'. */
function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Read gap decoration properties directly from the element's style object.
 * JS may set properties via el.style.rowRuleColor that don't appear in
 * getAttribute('style') when the user agent doesn't implement them.
 */
function applyStyleObjectProperties(
  el: HTMLElement,
  styles: ComputedGapStyles,
): void {
  const elStyle = el.style as unknown as Record<string, string>;

  // Check longhands
  for (const propName of Object.keys(LONGHANDS)) {
    const camel = toCamelCase(propName);
    const value = elStyle[camel];
    if (value && typeof value === "string" && value !== "") {
      const parsed = parseLonghandValue(propName as LonghandName, value);
      if (parsed !== null) {
        (styles as unknown as Record<string, unknown>)[propName] = parsed;
      }
    }
  }

  // Check shorthands
  for (const propName of Object.keys(SHORTHANDS)) {
    const camel = toCamelCase(propName);
    const value = elStyle[camel];
    if (value && typeof value === "string" && value !== "") {
      const decomposed = decomposeShorthand(propName, value);
      if (!decomposed) {
        continue;
      }
      for (const [lhName, lhValue] of decomposed) {
        (styles as unknown as Record<string, unknown>)[lhName] = lhValue;
      }
    }
  }
}

/**
 * Quick check if a style attribute string contains gap decoration property names.
 */
function hasGapDecorationInStyle(styleText: string): boolean {
  const lower = styleText.toLowerCase();
  return lower.includes("rule-") || lower.includes("rule:");
}

/** Quick check if an element's style object has any gap decoration properties. */
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
