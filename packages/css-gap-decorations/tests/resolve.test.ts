import { describe, expect, it } from "vitest";
import type { GapDataList } from "../src/properties.js";
import {
  expandGapDataList,
  resolveRuleBreak,
  resolveVisibilityItems,
} from "../src/resolve.js";

describe("expandGapDataList", () => {
  it("cycles a simple list", () => {
    const list: GapDataList<string> = [
      { isRepeat: false, value: "red" },
      { isRepeat: false, value: "blue" },
    ];
    expect(expandGapDataList(list, 5)).toEqual([
      "red",
      "blue",
      "red",
      "blue",
      "red",
    ]);
  });

  it("expands integer repeat", () => {
    const list: GapDataList<string> = [
      { isRepeat: false, value: "gray" },
      { isRepeat: true, count: 3, values: ["red", "blue"] },
      { isRepeat: false, value: "gray" },
    ];
    // Expanded: gray, red, blue, red, blue, red, blue, gray
    // For 8 gaps: each gets one
    expect(expandGapDataList(list, 8)).toEqual([
      "gray",
      "red",
      "blue",
      "red",
      "blue",
      "red",
      "blue",
      "gray",
    ]);
  });

  it("expands auto repeat", () => {
    const list: GapDataList<string> = [
      { isRepeat: false, value: "gray" },
      { isRepeat: true, count: "auto", values: ["red", "blue"] },
      { isRepeat: false, value: "gray" },
    ];
    // leading=1 (gray), trailing=1 (gray), auto fills 3 slots for gapCount=5
    expect(expandGapDataList(list, 5)).toEqual([
      "gray",
      "red",
      "blue",
      "red",
      "gray",
    ]);
  });

  it("handles single value for multiple gaps", () => {
    const list: GapDataList<number> = [{ isRepeat: false, value: 3 }];
    expect(expandGapDataList(list, 4)).toEqual([3, 3, 3, 3]);
  });

  it("returns empty for zero gaps", () => {
    const list: GapDataList<string> = [{ isRepeat: false, value: "red" }];
    expect(expandGapDataList(list, 0)).toEqual([]);
  });
});

describe("resolveRuleBreak", () => {
  it("returns value as-is for non-normal", () => {
    expect(resolveRuleBreak("none", "grid", "column")).toBe("none");
    expect(resolveRuleBreak("intersection", "flex", "column")).toBe(
      "intersection",
    );
  });

  it("resolves normal for grid", () => {
    expect(resolveRuleBreak("normal", "grid", "column")).toBe("normal");
  });

  it("resolves normal for flex as none", () => {
    expect(resolveRuleBreak("normal", "flex", "column")).toBe("none");
  });

  it("resolves normal for multicol column as intersection", () => {
    expect(resolveRuleBreak("normal", "multicol", "column")).toBe(
      "intersection",
    );
  });

  it("resolves normal for multicol row as none", () => {
    expect(resolveRuleBreak("normal", "multicol", "row")).toBe("none");
  });
});

describe("resolveVisibilityItems", () => {
  it("resolves normal for grid as all", () => {
    expect(resolveVisibilityItems("normal", "grid", "column")).toBe("all");
  });

  it("resolves normal for multicol column as between", () => {
    expect(resolveVisibilityItems("normal", "multicol", "column")).toBe(
      "between",
    );
  });

  it("resolves normal for multicol row as all", () => {
    expect(resolveVisibilityItems("normal", "multicol", "row")).toBe("all");
  });
});
