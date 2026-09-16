import { describe, expect, it } from "vitest";
import { cellAt, snapTokenCenter, type GridSpec } from "../src";

const grid: GridSpec = { cellSize: 50, offsetX: 10, offsetY: 20, unitsPerCell: 5, unitLabel: "ft" };

describe("grid geometry", () => {
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
