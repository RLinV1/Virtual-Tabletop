import { describe, expect, it } from "vitest";
import {
  cellAt, ClientMessage, DEFAULT_GRID, GridSpec, LibraryPatchRequest, snapTokenCenter, type GridSpec as GridSpecType,
} from "../src";

const grid: GridSpecType = { cellSize: 50, offsetX: 10, offsetY: 20, unitsPerCell: 5, unitLabel: "ft" };

describe("grid geometry", () => {
  it("rejects noncanonical offsets at shared command and library boundaries", () => {
    const valid = { ...DEFAULT_GRID, offsetX: DEFAULT_GRID.cellSize - 0.01 };
    expect(GridSpec.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...DEFAULT_GRID, offsetX: DEFAULT_GRID.cellSize },
      { ...DEFAULT_GRID, offsetY: DEFAULT_GRID.cellSize + 1 },
    ]) {
      expect(GridSpec.safeParse(invalid).success).toBe(false);
      expect(ClientMessage.safeParse({
        type: "command", clientCommandId: "c1", command: { type: "scene.setGrid", grid: invalid },
      }).success).toBe(false);
      expect(ClientMessage.safeParse({
        type: "command", clientCommandId: "c2", command: {
          type: "scene.setMap", map: { url: "/uploads/map.png", width: 500, height: 500 }, grid: invalid,
        },
      }).success).toBe(false);
      expect(LibraryPatchRequest.safeParse({ grid: invalid }).success).toBe(false);
    }
  });

  it("finds the containing cell, respecting offset", () => {
    expect(cellAt({ x: 10, y: 20 }, grid)).toEqual({ col: 0, row: 0 });
    expect(cellAt({ x: 9, y: 19 }, grid)).toEqual({ col: -1, row: -1 });
    expect(cellAt({ x: 60, y: 70 }, grid)).toEqual({ col: 1, row: 1 });
  });

  it("snaps odd-sized tokens to cell centers", () => {
    expect(snapTokenCenter({ x: 44, y: 51 }, 1, grid)).toEqual({ x: 35, y: 45 });
    expect(snapTokenCenter({ x: 61, y: 71 }, 1, grid)).toEqual({ x: 85, y: 95 });
  });

  it("snaps even-sized tokens to grid intersections", () => {
    expect(snapTokenCenter({ x: 66, y: 64 }, 2, grid)).toEqual({ x: 60, y: 70 });
  });
});
