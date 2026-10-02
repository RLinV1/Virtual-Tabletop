import { describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { gridLines } from "../src/board/gridLines";
import { drawGridSample, GRID_CELL_SNAP, gridFromSample, moveGridSample, positiveModulo, screenToMap, snapGridSampleOffsets } from "../src/pages/gridSample";

const map = { width: 1000, height: 800 };

describe("sample grid calibration (KAN-09, FR-GM-04)", () => {
  it.each([[1, 1], [-1, 1], [1, -1], [-1, -1]])("locks a square in direction %s, %s", (sx, sy) => {
    const anchor = { x: 425.5, y: 315.75 };
    const sample = drawGridSample(anchor, { x: anchor.x + sx * 110.25, y: anchor.y + sy * 55 }, 1, map)!;
    expect(sample.anchor).toEqual(anchor);
    expect(sample.corner).toEqual({ x: anchor.x + sx * 110.25, y: anchor.y + sy * 110.25 });
    const grid = gridFromSample(sample, DEFAULT_GRID, map)!;
    expect(grid.cellSize).toBe(110.25);
    expect(grid.offsetX).toBe(positiveModulo(anchor.x, grid.cellSize));
    expect(grid.offsetY).toBe(positiveModulo(anchor.y, grid.cellSize));
  });

  it("uses the vertical axis when it dominates and handles an axis-only placement", () => {
    expect(drawGridSample({ x: 10, y: 10 }, { x: 15, y: 80 }, 1, map)?.corner).toEqual({ x: 80, y: 80 });
    expect(drawGridSample({ x: 100, y: 100 }, { x: 100, y: 25 }, 1, map)?.corner).toEqual({ x: 175, y: 25 });
  });

  it.each([1, 3, 5] as const)("divides a %s-square sample without rounding and preserves scale and style", (count) => {
    const existing = { ...DEFAULT_GRID, unitsPerCell: 10, unitLabel: "m", lineColor: "#abcdef", lineWidth: 3, lineOpacity: 0.7 };
    const sample = drawGridSample({ x: 17.125, y: 23.75 }, { x: 227.875, y: 123.75 }, count, map)!;
    const grid = gridFromSample(sample, existing, map)!;
    expect(grid.cellSize).toBe(210.75 / count);
    expect(grid.offsetX).toBe(17.125);
    expect(grid.offsetY).toBe(23.75);
    expect(grid).toMatchObject({ unitsPerCell: 10, unitLabel: "m", lineColor: "#abcdef", lineWidth: 3, lineOpacity: 0.7 });
  });

  it.each([
    [{ x: 950, y: 600 }, { x: 1200, y: 650 }, { x: 1000, y: 650 }],
    [{ x: 80, y: 20 }, { x: -10, y: -200 }, { x: 60, y: 0 }],
    [{ x: 0, y: 0 }, { x: 900, y: 900 }, { x: 800, y: 800 }],
    [{ x: 1000, y: 800 }, { x: 0, y: 0 }, { x: 200, y: 0 }],
  ])("clamps to both image borders", (anchor, pointer, corner) => {
    expect(drawGridSample(anchor, pointer, 1, map)?.corner).toEqual(corner);
  });

  it("rejects empty, nonfinite and out-of-image gestures", () => {
    expect(drawGridSample({ x: 10, y: 20 }, { x: 10, y: 20 }, 1, map)).toBeNull();
    expect(drawGridSample({ x: -1, y: 20 }, { x: 10, y: 30 }, 1, map)).toBeNull();
    expect(drawGridSample({ x: 10, y: 20 }, { x: Infinity, y: 30 }, 1, map)).toBeNull();
    expect(drawGridSample({ x: 0, y: 20 }, { x: -10, y: 30 }, 1, map)).toBeNull();
  });

  it("validates tiny and oversized squares through the existing draft limits", () => {
    const tiny = drawGridSample({ x: 0, y: 0 }, { x: 0.01, y: 0.01 }, 5, map)!;
    expect(gridFromSample(tiny, DEFAULT_GRID, map)).toBeNull();
    const largeMap = { width: 10000, height: 10000 };
    const huge = drawGridSample({ x: 0, y: 0 }, { x: 2100, y: 2100 }, 1, largeMap)!;
    expect(gridFromSample(huge, DEFAULT_GRID, largeMap)).toBeNull();
    expect(gridFromSample({ ...huge, count: 3 }, DEFAULT_GRID, largeMap)?.cellSize).toBe(700);
  });

  it("extends alignment across bordered images, including partial edge cells", () => {
    const bordered = { width: 350, height: 280 };
    const sample = drawGridSample({ x: 81.25, y: 105 }, { x: 128.75, y: 152.5 }, 1, bordered)!;
    const grid = gridFromSample(sample, DEFAULT_GRID, bordered)!;
    expect(grid).toMatchObject({ cellSize: 47.5, offsetX: 33.75, offsetY: 10 });
    expect(gridLines(grid, { x: 0, y: 0, ...bordered })).toEqual({
      xs: [33.75, 81.25, 128.75, 176.25, 223.75, 271.25, 318.75],
      ys: [10, 57.5, 105, 152.5, 200, 247.5],
    });
  });

  it("keeps offsets canonical, including exact multiples and negative zero", () => {
    expect(positiveModulo(-1.25, 20.5)).toBe(19.25);
    expect(positiveModulo(205, 20.5)).toBe(0);
    expect(positiveModulo(-Number.MIN_VALUE, 20.5)).toBe(0);
    expect(Object.is(positiveModulo(-0, 20.5), -0)).toBe(false);
    const sample = drawGridSample({ x: 210, y: 140 }, { x: 280, y: 210 }, 1, map)!;
    expect(gridFromSample(sample, DEFAULT_GRID, map)).toEqual(DEFAULT_GRID);
  });

  it("moves and clamps reverse samples without changing spacing", () => {
    const sample = drawGridSample({ x: 250, y: 300 }, { x: 100, y: 200 }, 3, map)!;
    const moved = moveGridSample(sample, { x: -1000, y: 900 }, map);
    expect(moved.anchor).toEqual({ x: 150, y: 800 });
    expect(moved.corner).toEqual({ x: 0, y: 650 });
    expect(gridFromSample(moved, DEFAULT_GRID, map)?.cellSize).toBe(50);
    expect(sample.anchor).toEqual({ x: 250, y: 300 });
  });

  it("resizes in reverse while retaining the original anchor", () => {
    const original = drawGridSample({ x: 250, y: 300 }, { x: 100, y: 200 }, 3, map)!;
    const resized = drawGridSample(original.anchor, { x: 25, y: 175 }, original.count, map)!;
    expect(resized.anchor).toEqual(original.anchor);
    expect(resized.corner).toEqual({ x: 25, y: 75 });
    expect(gridFromSample(resized, DEFAULT_GRID, map)?.cellSize).toBe(75);
  });

  it.each([0.25, 1, 2.5, 8])("produces identical geometry at screen scale %s with pan and letterboxing", (scale) => {
    const inverse = { a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -137 / scale, f: 42 / scale };
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x * scale + 137, y: p.y * scale - 42 });
    const anchor = screenToMap(toScreen({ x: 17.125, y: 23.75 }), inverse);
    const corner = screenToMap(toScreen({ x: 227.875, y: 123.75 }), inverse);
    expect(gridFromSample(drawGridSample(anchor, corner, 3, map)!, DEFAULT_GRID, map))
      .toEqual({ ...DEFAULT_GRID, cellSize: 70.25, offsetX: 17.125, offsetY: 23.75 });
  });

  it.each([1, 3, 5] as const)("snaps each cell to exactly 0.5 image pixels for count %s", (count) => {
    const anchor = { x: 425.50003548749714, y: 400.7500189111005 };
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const sample = drawGridSample(anchor, { x: anchor.x + sx * 70.3 * count, y: anchor.y + sy * 50 * count }, count, map, GRID_CELL_SNAP)!;
      expect(gridFromSample(sample, DEFAULT_GRID, map)?.cellSize).toBe(70.5);
      expect(sample.side).toBe(70.5 * count);
      expect(sample.anchor).toEqual(anchor);
    }
  });

  it("rounds to the nearest half pixel, and freeform retains the original fractional side", () => {
    const anchor = { x: 425.5, y: 315.75 }, pointer = { x: 635.875, y: 420.25 };
    expect(gridFromSample(drawGridSample(anchor, pointer, 3, map, GRID_CELL_SNAP)!, DEFAULT_GRID, map)?.cellSize).toBe(70);
    expect(gridFromSample(drawGridSample(anchor, pointer, 3, map, 0)!, DEFAULT_GRID, map)?.cellSize).toBe(70.125);
  });

  it("floors a snapped side at an image boundary while retaining A", () => {
    const anchor = { x: 950.125, y: 600.25 };
    const sample = drawGridSample(anchor, { x: 1200, y: 650 }, 3, map, GRID_CELL_SNAP)!;
    expect(sample.anchor).toEqual(anchor);
    expect(sample.corner).toEqual({ x: 999.625, y: 649.75 });
    expect(gridFromSample(sample, DEFAULT_GRID, map)?.cellSize).toBe(16.5);
  });

  it("rejects a snapped zero side and allows the next half-pixel candidate", () => {
    expect(drawGridSample({ x: 100, y: 100 }, { x: 100.2, y: 100.1 }, 1, map, GRID_CELL_SNAP)).toBeNull();
    expect(gridFromSample(drawGridSample({ x: 100, y: 100 }, { x: 100.3, y: 100.1 }, 1, map, GRID_CELL_SNAP)!, DEFAULT_GRID, map)?.cellSize).toBe(0.5);
  });

  it("preserves exact snapped spacing through fractional translation and count reinterpretation", () => {
    const sample = drawGridSample({ x: 425.50003548749714, y: 315.75 }, { x: 637, y: 400 }, 3, map, GRID_CELL_SNAP)!;
    const moved = moveGridSample(sample, { x: 0.123456789, y: -0.987654321 }, map);
    expect(gridFromSample(moved, DEFAULT_GRID, map)?.cellSize).toBe(70.5);
    expect(gridFromSample({ ...moved, count: 5 }, DEFAULT_GRID, map)?.cellSize).toBe(42.3);
  });

  it.each([1, 3, 5] as const)("snaps both offsets and keeps handles aligned for count %s", (count) => {
    const anchor = { x: 430.1375, y: 400.24 };
    const sample = drawGridSample(anchor, { x: anchor.x + 70.3 * count, y: anchor.y + 60 * count }, count, map, GRID_CELL_SNAP)!;
    const snapped = snapGridSampleOffsets(sample, map, GRID_CELL_SNAP)!;
    const grid = gridFromSample(snapped, DEFAULT_GRID, map, GRID_CELL_SNAP)!;
    expect(grid).toMatchObject({ cellSize: 70.5, offsetX: 7, offsetY: 47.5 });
    expect(snapped.anchor).toEqual({ x: 430, y: 400 });
    expect(snapped.side).toBe(sample.side);
    expect(positiveModulo(snapped.corner.x, grid.cellSize)).toBe(grid.offsetX);
    expect(positiveModulo(snapped.corner.y, grid.cellSize)).toBe(grid.offsetY);
  });

  it("snaps the canonical offsets of fractional spacing without changing its size", () => {
    const sample = drawGridSample({ x: 425.5, y: 315.75 }, { x: 635.875, y: 420.25 }, 3, map)!;
    const snapped = snapGridSampleOffsets(sample, map, GRID_CELL_SNAP)!;
    expect(snapped.anchor).toEqual({ x: 425.75, y: 316 });
    expect(gridFromSample(snapped, DEFAULT_GRID, map, GRID_CELL_SNAP)).toMatchObject({ cellSize: 70.125, offsetX: 5, offsetY: 35.5 });
  });

  it.each([[1, 1], [-1, 1], [1, -1], [-1, -1]])("keeps snapped offsets inside every boundary in quadrant %s, %s", (sx, sy) => {
    const sample = drawGridSample({ x: 500, y: 400 }, { x: 500 + sx * 210.375, y: 400 + sy * 100 }, 3, map)!;
    for (const delta of [{ x: -1e6, y: -1e6 }, { x: 1e6, y: 1e6 }]) {
      const snapped = snapGridSampleOffsets(moveGridSample(sample, delta, map), map, GRID_CELL_SNAP)!;
      const grid = gridFromSample(snapped, DEFAULT_GRID, map, GRID_CELL_SNAP)!;
      expect(grid.cellSize).toBe(70.125);
      expect(grid.offsetX % GRID_CELL_SNAP).toBe(0);
      expect(grid.offsetY % GRID_CELL_SNAP).toBe(0);
      for (const p of [snapped.anchor, snapped.corner]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(map.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(map.height);
      }
    }
  });

  it("keeps snapped zero offsets canonical on fractional grid periods", () => {
    const sample = { anchor: { x: 423, y: 380.7 }, corner: { x: 549.9, y: 507.6 }, side: 126.9, count: 3 as const };
    const snapped = snapGridSampleOffsets(sample, map, GRID_CELL_SNAP)!;
    expect(gridFromSample(snapped, DEFAULT_GRID, map, GRID_CELL_SNAP)).toMatchObject({ offsetX: 0, offsetY: 0 });
    const tiny = { anchor: { x: 100.03, y: 200.07 }, corner: { x: 100.33, y: 200.37 }, side: 0.3, count: 3 as const };
    expect(gridFromSample(snapGridSampleOffsets(tiny, map, GRID_CELL_SNAP)!, DEFAULT_GRID, map, GRID_CELL_SNAP))
      .toMatchObject({ offsetX: 0, offsetY: 0 });
  });

  it("preserves freeform positions and offsets when snapping is bypassed", () => {
    const sample = drawGridSample({ x: 425.5, y: 315.75 }, { x: 635.875, y: 420.25 }, 3, map)!;
    expect(snapGridSampleOffsets(sample, map, 0)).toBe(sample);
    expect(gridFromSample(sample, DEFAULT_GRID, map, 0)).toMatchObject({ cellSize: 70.125, offsetX: 4.75, offsetY: 35.25 });
  });
});
