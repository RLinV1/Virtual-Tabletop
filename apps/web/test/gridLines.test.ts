import { describe, expect, it } from "vitest";
import { gridLines } from "../src/board/gridLines";

describe("grid line positions (FR-GM-04, FR-GM-05)", () => {
  it("starts at zero with no offset and includes the far edge", () => {
    const { xs, ys } = gridLines({ cellSize: 50, offsetX: 0, offsetY: 0 }, { x: 0, y: 0, width: 150, height: 100 });
    expect(xs).toEqual([0, 50, 100, 150]);
    expect(ys).toEqual([0, 50, 100]);
  });

  it("shifts every line by the offset", () => {
    const { xs, ys } = gridLines({ cellSize: 50, offsetX: 10, offsetY: 49 }, { x: 0, y: 0, width: 120, height: 120 });
    expect(xs).toEqual([10, 60, 110]);
    expect(ys).toEqual([49, 99]);
  });

  it("returns only the lines inside a window that does not start at zero", () => {
    const { xs, ys } = gridLines({ cellSize: 50, offsetX: 10, offsetY: 0 }, { x: 75, y: 100, width: 100, height: 25 });
    expect(xs).toEqual([110, 160]);
    expect(ys).toEqual([100]);
  });

  it("keeps a line that lands exactly on the window's far edge", () => {
    const { xs } = gridLines({ cellSize: 64, offsetX: 0, offsetY: 0 }, { x: 64, y: 0, width: 128, height: 0 });
    expect(xs).toEqual([64, 128, 192]);
  });

  it("matches the board's original stepping from the map origin", () => {
    const grid = { cellSize: 70.3, offsetX: 12.7, offsetY: 3.1 };
    const expected: number[] = [];
    for (let x = grid.offsetX; x <= 2048; x += grid.cellSize) expected.push(x);
    expect(gridLines(grid, { x: 0, y: 0, width: 2048, height: 0 }).xs).toEqual(expected);
  });
});
