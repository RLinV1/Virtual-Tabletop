import { describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { gridsEqual, parseGridDraft, toGridDraft } from "../src/pages/gridDraft";

describe("grid calibration draft with line styling", () => {
  it("keeps accepted styling when the GM changes alignment", () => {
    const accepted = { ...DEFAULT_GRID, lineColor: "#aabbcc", lineWidth: 4, lineOpacity: 0.6 };
    const draft = { ...toGridDraft(accepted), offsetX: "12" };

    expect(parseGridDraft(draft)).toEqual({ ...accepted, offsetX: 12 });
    expect(gridsEqual(parseGridDraft(draft)!, accepted)).toBe(false);
  });

  it("treats a style edit as a change and rejects an incomplete numeric draft", () => {
    const styled = { ...toGridDraft(DEFAULT_GRID), lineColor: "#ffffff" };

    expect(gridsEqual(parseGridDraft(styled)!, DEFAULT_GRID)).toBe(false);
    expect(parseGridDraft({ ...styled, cellSize: "" })).toBeNull();
    expect(gridsEqual(parseGridDraft(toGridDraft(DEFAULT_GRID))!, DEFAULT_GRID)).toBe(true);
  });
});
