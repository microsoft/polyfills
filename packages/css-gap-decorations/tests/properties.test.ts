import { describe, expect, it } from "vitest";
import {
  ALL_PROPERTY_NAMES,
  getInitialComputedStyles,
  isGapDecorationProperty,
  LONGHANDS,
  SHORTHANDS,
} from "../src/properties.js";

describe("property table", () => {
  it("has 19 longhands", () => {
    expect(Object.keys(LONGHANDS)).toHaveLength(19);
  });

  it("has 23 shorthands", () => {
    expect(Object.keys(SHORTHANDS)).toHaveLength(23);
  });

  it("ALL_PROPERTY_NAMES contains all properties", () => {
    expect(ALL_PROPERTY_NAMES.size).toBe(19 + 23);
  });

  it("recognizes known properties", () => {
    expect(isGapDecorationProperty("column-rule-color")).toBe(true);
    expect(isGapDecorationProperty("row-rule-width")).toBe(true);
    expect(isGapDecorationProperty("rule-break")).toBe(true);
    expect(isGapDecorationProperty("rule-overlap")).toBe(true);
    expect(isGapDecorationProperty("column-rule-inset-cap-start")).toBe(true);
    expect(isGapDecorationProperty("rule-inset")).toBe(true);
  });

  it("rejects unknown properties", () => {
    expect(isGapDecorationProperty("color")).toBe(false);
    expect(isGapDecorationProperty("column-rule-outset")).toBe(false);
  });

  it("all shorthand longhands reference valid longhands", () => {
    for (const [_name, def] of Object.entries(SHORTHANDS)) {
      for (const lh of def.longhands) {
        expect(LONGHANDS).toHaveProperty(lh, expect.anything());
      }
    }
  });

  it("getInitialComputedStyles returns all longhands", () => {
    const styles = getInitialComputedStyles();
    for (const name of Object.keys(LONGHANDS)) {
      expect(styles).toHaveProperty(name);
    }
  });
});
