import { z } from "zod";

/**
 * Board coordinates: pixels of the scene's map image, origin at the image's top-left.
 * Independent of any client's viewport, pan, or zoom (FR-GM-05, FR-TAC-01).
 */
export const Point = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Point = z.infer<typeof Point>;

/** Square grid in board coordinates (FR-GM-03/04/05). */
export const GridSpec = z.object({
  /** Cell edge length in board pixels. */
  cellSize: z.number().positive().max(2000),
  /** Offset of the first grid line from the image origin, in board pixels, 0 <= offset < cellSize. */
  offsetX: z.number().min(0),
  offsetY: z.number().min(0),
  /** Distance one cell represents, e.g. 5 (ft). Used by rulers/AoE later. */
  unitsPerCell: z.number().positive(),
  unitLabel: z.string().min(1).max(12),
  /**
   * Line style (ADR 0005). Optional, not defaulted: stored events and library grids from
   * before these fields are read back unparsed, so every reader resolves them through
   * `gridLineStyle` instead.
   */
  lineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Board pixels, so the lines scale with each viewer's zoom (invariant 8). */
  lineWidth: z.number().min(0.5).max(8).optional(),
  /** 0.05 floor: an applied grid cannot become invisible by accident. */
  lineOpacity: z.number().min(0.05).max(1).optional(),
}).superRefine((grid, ctx) => {
  for (const offset of ["offsetX", "offsetY"] as const) {
    if (grid[offset] >= grid.cellSize) {
      ctx.addIssue({
        code: "custom",
        path: [offset],
        message: "Grid offset must be less than the cell size",
      });
    }
  }
});
export type GridSpec = z.infer<typeof GridSpec>;

/** Thickness presets offered to the GM, in board pixels (Hairline, Thin, Medium, Thick, Bold). */
export const GRID_LINE_WIDTHS = [1, 2, 3, 4, 6] as const;

/** The grid's line style, with the historical look for anything unset (ADR 0005). */
export function gridLineStyle(grid: GridSpec): { color: string; width: number; opacity: number } {
  return { color: grid.lineColor ?? "#000000", width: grid.lineWidth ?? 1, opacity: grid.lineOpacity ?? 0.35 };
}

export const DEFAULT_GRID: GridSpec = {
  cellSize: 70,
  offsetX: 0,
  offsetY: 0,
  unitsPerCell: 5,
  unitLabel: "ft",
};

/** Integer cell containing a board point. */
export function cellAt(p: Point, grid: GridSpec): { col: number; row: number } {
  return {
    col: Math.floor((p.x - grid.offsetX) / grid.cellSize),
    row: Math.floor((p.y - grid.offsetY) / grid.cellSize),
  };
}

/**
 * Snap a token's center point (FR-TAC-02). Tokens spanning an odd number of cells
 * center on a cell center; even-sized tokens center on a grid intersection.
 */
export function snapTokenCenter(p: Point, sizeInCells: number, grid: GridSpec): Point {
  const half = sizeInCells % 2 === 1 ? grid.cellSize / 2 : 0;
  const snap = (v: number, offset: number) =>
    Math.round((v - offset - half) / grid.cellSize) * grid.cellSize + offset + half;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}
