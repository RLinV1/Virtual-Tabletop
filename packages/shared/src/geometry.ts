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

/** Bring offsets from older saved grids into the canonical range before reuse. */
export function normalizeGridOffsets(grid: GridSpec): GridSpec {
  return {
    ...grid,
    offsetX: grid.offsetX % grid.cellSize,
    offsetY: grid.offsetY % grid.cellSize,
  };
}

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

/** True when a token's center is where `snapTokenCenter` would put it (within float noise). */
export function isSnapped(p: Point, sizeInCells: number, grid: GridSpec): boolean {
  const snapped = snapTokenCenter(p, sizeInCells, grid);
  return Math.abs(snapped.x - p.x) < 1e-6 && Math.abs(snapped.y - p.y) < 1e-6;
}

/**
 * Where a grid-aligned token goes when its size changes (KAN-74): it keeps its top-left cell,
 * so a size-2 token set to size 1 lands in a cell instead of staying on an intersection.
 */
export function resizedTokenCenter(p: Point, fromSize: number, toSize: number, grid: GridSpec): Point {
  const shift = ((toSize - fromSize) * grid.cellSize) / 2;
  return { x: p.x + shift, y: p.y + shift };
}

/**
 * Signed area of a polygon (shoelace formula), in square board pixels. Zero for a degenerate
 * polygon whose points all lie on one line (FR-GM-17).
 */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Whether `p` lies inside a polygon (even-odd ray casting). A point exactly on an edge may land
 * either side; callers that need a firm answer (fog, FR-GM-17) treat the result as authoritative,
 * so server and clients agree because they run this same function.
 */
export function pointInPolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Where `count` tokens of `sizeInCells` go when placed together on `origin` (KAN-70): the first on
 * `origin`, the rest on the nearest free spots, ring by ring outward in a fixed order (row by row
 * within a ring), one footprint apart. A spot is free when its footprint overlaps no token in
 * `occupied` (or an earlier copy), whatever their size, and its whole footprint lies on the map
 * when there is one. When space or the search budget runs out, remaining copies share `origin`. Pure, so
 * `decide` can call it.
 */
export function spreadPositions(
  origin: Point,
  sizeInCells: number,
  count: number,
  grid: GridSpec,
  map: { width: number; height: number } | null,
  occupied: readonly { position: Point; size: number }[],
): Point[] {
  const step = sizeInCells * grid.cellSize;
  const taken = occupied.map((o) => ({ p: o.position, half: (o.size * grid.cellSize) / 2 }));
  // Footprints are squares; they overlap when both axis distances are under the summed half-sides.
  const free = (p: Point) => !taken.some((o) => Math.abs(o.p.x - p.x) < o.half + step / 2 && Math.abs(o.p.y - p.y) < o.half + step / 2);
  const onMap = (p: Point) =>
    !map || (p.x - step / 2 >= 0 && p.y - step / 2 >= 0 && p.x + step / 2 <= map.width && p.y + step / 2 <= map.height);
  const out: Point[] = [origin];
  taken.push({ p: origin, half: step / 2 });
  // Bound server work independently of caller-controlled dimensions and token size.
  // Twenty rings visit at most 1,680 perimeter candidates.
  const maxRing = Math.min(20, map ? Math.ceil(Math.max(map.width, map.height) / step) : 20);
  for (let ring = 1; out.length < count && ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring && out.length < count; dy++) {
      // Interior rows contain only the left and right perimeter points.
      const stride = Math.abs(dy) === ring ? 1 : 2 * ring;
      for (let dx = -ring; dx <= ring && out.length < count; dx += stride) {

        const p = { x: origin.x + dx * step, y: origin.y + dy * step };
        if (!onMap(p) || !free(p)) continue;
        out.push(p);
        taken.push({ p, half: step / 2 });
      }
    }
  }
  while (out.length < count) out.push(origin);
  return out;
}
