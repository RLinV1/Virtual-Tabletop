import { describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { minimumGridCellSizeForDisplay } from "../src/board/gridRenderLimit";
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

  it("rejects a cell size that would exceed the board's line limit", () => {
    const draft = { ...toGridDraft(DEFAULT_GRID), cellSize: "0.05" };
    expect(parseGridDraft(draft)).toBeNull();
    expect(parseGridDraft({ ...draft, cellSize: "0.07" })).not.toBeNull();
    expect(parseGridDraft(draft, { width: 500, height: 500 })).not.toBeNull();
    expect(parseGridDraft({ ...draft, cellSize: "0.01" }, { width: 500, height: 500 })).toBeNull();
    expect(minimumGridCellSizeForDisplay()).toBe(0.07);
    expect(minimumGridCellSizeForDisplay({ width: 2501, height: 1500 })).toBe(0.09);
  });
});
