import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type FogRegion, type GridSpec, type MapImage } from "@vtt/shared";
import { cellsRegion, coversWholeMap, describeCells, gridSize, wholeMapRegion } from "../src/panels/fogCells";

const map: MapImage = { url: "/uploads/map.png", width: 700, height: 350 };
const grid: GridSpec = DEFAULT_GRID; // 70 px cells, no offset: 10 columns, 5 rows
const offsetGrid: GridSpec = { ...DEFAULT_GRID, offsetX: 10, offsetY: 20 };

function rect(id: string, x0: number, y0: number, x1: number, y1: number): FogRegion {
  return { id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}

describe("fog of war by keyboard: grid cells (FR-GM-17)", () => {
  it("counts the columns and rows that cover the map, partial edge cells included", () => {
    expect(gridSize(map, grid)).toEqual({ cols: 10, rows: 5 });
    // A 10/20 px offset leaves a thin first column and row at the top-left edge.
    expect(gridSize(map, offsetGrid)).toEqual({ cols: 11, rows: 6 });
  });

  it("turns a block of cells into a rectangle in board coordinates, in either corner order", () => {
    expect(cellsRegion({ col: 2, row: 2 }, { col: 3, row: 4 }, map, grid)).toEqual({
      shape: "rect", from: { x: 70, y: 70 }, to: { x: 210, y: 280 },
    });
    expect(cellsRegion({ col: 3, row: 4 }, { col: 2, row: 2 }, map, grid)).toEqual(
      cellsRegion({ col: 2, row: 2 }, { col: 3, row: 4 }, map, grid),
    );
  });

  it("cuts the first cell of an offset grid at the map's edge", () => {
    expect(cellsRegion({ col: 1, row: 1 }, { col: 1, row: 1 }, map, offsetGrid)).toEqual({
      shape: "rect", from: { x: 0, y: 0 }, to: { x: 10, y: 20 },
    });
    expect(cellsRegion({ col: 2, row: 2 }, { col: 2, row: 2 }, map, offsetGrid)).toEqual({
      shape: "rect", from: { x: 10, y: 20 }, to: { x: 80, y: 90 },
    });
  });

  it("clamps cells past the map onto its last column and row", () => {
    expect(cellsRegion({ col: 9, row: 5 }, { col: 50, row: 50 }, map, grid)).toEqual({
      shape: "rect", from: { x: 560, y: 280 }, to: { x: 700, y: 350 },
    });
  });

  it("describes a region by the cells it covers", () => {
    expect(describeCells(rect("a", 70, 70, 210, 280), map, grid)).toBe("columns 2–3, rows 2–4");
    expect(describeCells(rect("b", 0, 0, 70, 70), map, grid)).toBe("column 1, row 1");
    // A polygon is described by the cells its bounding box touches.
    const triangle: FogRegion = { id: "c", shape: "polygon", points: [{ x: 100, y: 10 }, { x: 300, y: 10 }, { x: 200, y: 200 }] };
    expect(describeCells(triangle, map, grid)).toBe("columns 2–5, rows 1–3");
    // The description round-trips what cellsRegion made.
    const made = cellsRegion({ col: 4, row: 1 }, { col: 6, row: 3 }, map, offsetGrid);
    expect(describeCells({ points: [made.from, made.to] }, map, offsetGrid)).toBe("columns 4–6, rows 1–3");
  });

  it("recognises the whole-map rectangle so the list can name it", () => {
    const whole = wholeMapRegion(map);
    expect(whole).toEqual({ shape: "rect", from: { x: 0, y: 0 }, to: { x: 700, y: 350 } });
    expect(coversWholeMap(rect("w", 0, 0, 700, 350), map)).toBe(true);
    expect(coversWholeMap(rect("p", 0, 0, 350, 350), map)).toBe(false);
    expect(coversWholeMap({ id: "t", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 350 }] }, map)).toBe(false);
  });
});
