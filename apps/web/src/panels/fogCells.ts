import { cellAt, type FogRegion, type GridSpec, type MapImage, type Point } from "@vtt/shared";

/**
 * Grid-cell arithmetic for the Fog of war section (FR-GM-17), the keyboard way to fog and reveal
 * the map. Cells are numbered from 1 at the map's top-left, counting a partial first column or row
 * that a grid offset leaves at the edge, so "column 1" is always the leftmost strip the GM sees.
 */

/** A 1-based column and row. */
export interface Cell {
  col: number;
  row: number;
}

/** How many columns and rows of cells cover the map, partial edge cells included. */
export function gridSize(map: MapImage, grid: GridSpec): { cols: number; rows: number } {
  const first = cellAt({ x: 0, y: 0 }, grid);
  const last = cellAt({ x: map.width - 0.5, y: map.height - 0.5 }, grid);
  return { cols: last.col - first.col + 1, rows: last.row - first.row + 1 };
}

/** The 1-based cell holding board point `p`, clamped to the map. */
function cellOf(p: Point, map: MapImage, grid: GridSpec): Cell {
  const first = cellAt({ x: 0, y: 0 }, grid);
  const at = cellAt({ x: clamp(p.x, 0, map.width - 0.5), y: clamp(p.y, 0, map.height - 0.5) }, grid);
  return { col: at.col - first.col + 1, row: at.row - first.row + 1 };
}

/**
 * The `fog.add` region covering cells `a` to `b` inclusive, in either order, cut to the map's edges
 * (board coordinates, invariant 8). Cells outside the map are clamped onto it.
 */
export function cellsRegion(a: Cell, b: Cell, map: MapImage, grid: GridSpec): { shape: "rect"; from: Point; to: Point } {
  const { cols, rows } = gridSize(map, grid);
  const first = cellAt({ x: 0, y: 0 }, grid);
  const col0 = clamp(Math.min(a.col, b.col), 1, cols);
  const col1 = clamp(Math.max(a.col, b.col), 1, cols);
  const row0 = clamp(Math.min(a.row, b.row), 1, rows);
  const row1 = clamp(Math.max(a.row, b.row), 1, rows);
  const x = (col: number) => grid.offsetX + (first.col + col - 1) * grid.cellSize;
  const y = (row: number) => grid.offsetY + (first.row + row - 1) * grid.cellSize;
  return {
    shape: "rect",
    from: { x: Math.max(0, x(col0)), y: Math.max(0, y(row0)) },
    to: { x: Math.min(map.width, x(col1 + 1)), y: Math.min(map.height, y(row1 + 1)) },
  };
}

/** The whole map as one fog rectangle. */
export function wholeMapRegion(map: MapImage): { shape: "rect"; from: Point; to: Point } {
  return { shape: "rect", from: { x: 0, y: 0 }, to: { x: map.width, y: map.height } };
}

/** Where a region sits, in the cells the GM counts: "columns 3–6, rows 2–4" or "column 3, row 2". */
export function describeCells(region: Pick<FogRegion, "points">, map: MapImage, grid: GridSpec): string {
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  // Edges sit on grid lines, so step half a pixel inside before asking which cell a corner is in.
  const lo = cellOf({ x: Math.min(...xs) + 0.5, y: Math.min(...ys) + 0.5 }, map, grid);
  const hi = cellOf({ x: Math.max(...xs) - 0.5, y: Math.max(...ys) - 0.5 }, map, grid);
  const span = (word: string, from: number, to: number) => (from === to ? `${word} ${from}` : `${word}s ${from}–${to}`);
  return `${span("column", lo.col, hi.col)}, ${span("row", lo.row, hi.row)}`;
}

/** Whether a region is exactly the whole map, so the list can call it that. */
export function coversWholeMap(region: FogRegion, map: MapImage): boolean {
  if (region.shape !== "rect") return false;
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  return Math.min(...xs) <= 0 && Math.min(...ys) <= 0 && Math.max(...xs) >= map.width && Math.max(...ys) >= map.height;
}

/** `n` limited to the range `lo`..`hi`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
