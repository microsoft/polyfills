import { describe, expect, it } from "vitest";
import {
  decomposeShorthand,
  parseColorList,
  parseGapRule,
  parseInsetValue,
  parseRuleBreak,
  parseRuleOverlap,
  parseRuleShorthand,
  parseStyleList,
  parseVisibilityItems,
  parseWidthList,
  splitTopLevelCommas,
} from "../src/parse.js";

describe("splitTopLevelCommas", () => {
  it("splits simple values", () => {
    expect(splitTopLevelCommas("red, blue, green")).toEqual([
      "red",
      " blue",
      " green",
    ]);
  });

  it("does not split inside parens", () => {
    expect(splitTopLevelCommas("repeat(2, red, blue), green")).toEqual([
      "repeat(2, red, blue)",
      " green",
    ]);
  });
});

describe("parseColorList", () => {
  it("parses single color", () => {
    const result = parseColorList("red");
    expect(result).toEqual([{ isRepeat: false, value: "red" }]);
  });

  it("parses comma-separated colors", () => {
    const result = parseColorList("red, blue, green");
    expect(result).toEqual([
      { isRepeat: false, value: "red" },
      { isRepeat: false, value: "blue" },
      { isRepeat: false, value: "green" },
    ]);
  });

  it("parses repeat with integer", () => {
    const result = parseColorList("repeat(3, red, blue)");
    expect(result).toEqual([
      { isRepeat: true, count: 3, values: ["red", "blue"] },
    ]);
  });

  it("parses repeat with auto", () => {
    const result = parseColorList("gray, repeat(auto, red, blue), gray");
    expect(result).toEqual([
      { isRepeat: false, value: "gray" },
      { isRepeat: true, count: "auto", values: ["red", "blue"] },
      { isRepeat: false, value: "gray" },
    ]);
  });

  it("rejects multiple auto repeats", () => {
    const result = parseColorList("repeat(auto, red), repeat(auto, blue)");
    expect(result).toBeNull();
  });
});

describe("parseStyleList", () => {
  it("parses single style", () => {
    expect(parseStyleList("solid")).toEqual([
      { isRepeat: false, value: "solid" },
    ]);
  });

  it("parses multiple styles", () => {
    expect(parseStyleList("solid, dashed, dotted")).toEqual([
      { isRepeat: false, value: "solid" },
      { isRepeat: false, value: "dashed" },
      { isRepeat: false, value: "dotted" },
    ]);
  });

  it("rejects invalid style", () => {
    expect(parseStyleList("banana")).toBeNull();
  });
});

describe("parseWidthList", () => {
  it("parses keyword widths", () => {
    expect(parseWidthList("thin")).toEqual([{ isRepeat: false, value: 1 }]);
    expect(parseWidthList("medium")).toEqual([{ isRepeat: false, value: 3 }]);
    expect(parseWidthList("thick")).toEqual([{ isRepeat: false, value: 5 }]);
  });

  it("parses px values", () => {
    expect(parseWidthList("5px")).toEqual([{ isRepeat: false, value: 5 }]);
  });

  it("parses multiple widths with repeat", () => {
    expect(parseWidthList("1px, repeat(2, 3px, 5px)")).toEqual([
      { isRepeat: false, value: 1 },
      { isRepeat: true, count: 2, values: [3, 5] },
    ]);
  });
});

describe("parseRuleBreak", () => {
  it("accepts valid values", () => {
    expect(parseRuleBreak("none")).toBe("none");
    expect(parseRuleBreak("normal")).toBe("normal");
    expect(parseRuleBreak("intersection")).toBe("intersection");
  });

  it("rejects invalid values", () => {
    expect(parseRuleBreak("foo")).toBeNull();
  });
});

describe("parseVisibilityItems", () => {
  it("accepts valid values", () => {
    expect(parseVisibilityItems("all")).toBe("all");
    expect(parseVisibilityItems("normal")).toBe("normal");
    expect(parseVisibilityItems("around")).toBe("around");
    expect(parseVisibilityItems("between")).toBe("between");
  });
});

describe("parseRuleOverlap", () => {
  it("accepts valid values", () => {
    expect(parseRuleOverlap("row-over-column")).toBe("row-over-column");
    expect(parseRuleOverlap("column-over-row")).toBe("column-over-row");
  });
});

describe("parseInsetValue", () => {
  it("parses overlap-join", () => {
    expect(parseInsetValue("overlap-join")).toEqual({
      type: "keyword",
      value: "overlap-join",
    });
  });

  it("parses length", () => {
    expect(parseInsetValue("5px")).toEqual({ type: "length", value: 5 });
    expect(parseInsetValue("0")).toEqual({ type: "length", value: 0 });
  });

  it("parses negative length", () => {
    expect(parseInsetValue("-5px")).toEqual({ type: "length", value: -5 });
  });

  it("parses percentage", () => {
    expect(parseInsetValue("-50%")).toEqual({ type: "percentage", value: -50 });
    expect(parseInsetValue("25%")).toEqual({ type: "percentage", value: 25 });
  });
});

describe("parseGapRule", () => {
  it("parses width + style + color", () => {
    const result = parseGapRule("1px solid red");
    expect(result).not.toBeNull();
    expect(result?.width).toBe("1px");
    expect(result?.style).toBe("solid");
    expect(result?.color).toBe("red");
  });

  it("parses style only", () => {
    const result = parseGapRule("solid");
    expect(result).not.toBeNull();
    expect(result?.style).toBe("solid");
    expect(result?.width).toBeNull();
    expect(result?.color).toBeNull();
  });

  it("parses width + style", () => {
    const result = parseGapRule("3px dashed");
    expect(result).not.toBeNull();
    expect(result?.width).toBe("3px");
    expect(result?.style).toBe("dashed");
  });
});

describe("parseRuleShorthand", () => {
  it("parses simple rule", () => {
    const result = parseRuleShorthand("1px solid red");
    expect(result).not.toBeNull();
    expect(result?.widths).toEqual([{ isRepeat: false, value: 1 }]);
    expect(result?.styles).toEqual([{ isRepeat: false, value: "solid" }]);
    expect(result?.colors).toEqual([{ isRepeat: false, value: "red" }]);
  });

  it("parses list of rules", () => {
    const result = parseRuleShorthand("1px solid red, 2px dashed blue");
    expect(result).not.toBeNull();
    expect(result?.widths).toHaveLength(2);
    expect(result?.styles).toHaveLength(2);
    expect(result?.colors).toHaveLength(2);
  });

  it("parses repeat", () => {
    const result = parseRuleShorthand(
      "repeat(auto, 1px solid red, 2px dashed blue)",
    );
    expect(result).not.toBeNull();
    expect(result?.widths).toEqual([
      { isRepeat: true, count: "auto", values: [1, 2] },
    ]);
    expect(result?.styles).toEqual([
      { isRepeat: true, count: "auto", values: ["solid", "dashed"] },
    ]);
    expect(result?.colors).toEqual([
      { isRepeat: true, count: "auto", values: ["red", "blue"] },
    ]);
  });
});

describe("decomposeShorthand", () => {
  it("decomposes column-rule", () => {
    const result = decomposeShorthand("column-rule", "1px solid red");
    expect(result).not.toBeNull();
    expect(result?.has("column-rule-width")).toBe(true);
    expect(result?.has("column-rule-style")).toBe(true);
    expect(result?.has("column-rule-color")).toBe(true);
  });

  it("decomposes rule (bidirectional)", () => {
    const result = decomposeShorthand("rule", "1px solid red");
    expect(result).not.toBeNull();
    expect(result?.has("column-rule-width")).toBe(true);
    expect(result?.has("row-rule-width")).toBe(true);
  });
});
