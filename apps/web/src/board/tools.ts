import { pointInPolygon, snapTokenCenter, type AreaShape, type AreaTemplate, type FogRegion, type GridSpec, type Point, type Wall } from "@vtt/shared";

export type { AreaShape };

/**
 * Board tools (KAN-69): the tool rail's Measure, Draw, Area and Eraser tools. Pure geometry in board
 * coordinates (invariant 8), so it is testable without Pixi. The marks these tools make are
 * local to the viewer; syncing them is KAN-33/35/39.
 */

/** `brush` is freehand, which FR-TAC-04 leaves out of the shared overlays; it is local-only here. */
export type DrawShape = "brush" | "line" | "rect" | "circle";

export type BoardTool =
  | { kind: "select" }
  | { kind: "measure" }
  | { kind: "draw"; shape: DrawShape; color: number }
  | {
      kind: "area";
      shape: AreaShape;
      /** Size for a click without a drag, in grid units, e.g. 20 (ft). */
      size: number;
      /** A line's width in cells: 1 (5 ft on a 5 ft grid) or 2 (KAN-35). */
      lineCells: 1 | 2;
      /** GM only: place it where players can't see it (ADR 0007). */
      gmOnly: boolean;
    }
  | { kind: "erase" }
  /** GM only (FR-GM-17, ADR 0016): conceal a rectangle or polygon, or reveal (remove) a fogged region. */
  | { kind: "fog"; mode: FogMode }
  /** GM only (FR-GM-09, wall-editing): draw walls, erase one, or detect walls like a clicked one. */
  | { kind: "walls"; mode: WallMode }
  /** Picking whom `attackerId` attacks (attack-targeting). Started from a token's Attack button, not the rail. */
  | { kind: "attack"; attackerId: string };

/** What the Fog tool does: drag a rectangle, click out a polygon, or click a region to remove it. */
export type FogMode = "rect" | "polygon" | "reveal";

/** What the Walls tool does: chain wall segments, remove a wall, or detect walls like the one clicked. */
export type WallMode = "draw" | "erase" | "sample";

/** The nearest point to `p` on the segment from `a` to `b`. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** The wall nearest `p` within `tolerance` board pixels, or null (the Walls tool's Erase). */
export function wallAt(walls: Record<string, Wall>, p: Point, tolerance: number): Wall | null {
  let best: Wall | null = null;
  let bestDistance = tolerance;
  for (const wall of Object.values(walls)) {
    const q = closestOnSegment(p, wall.a, wall.b);
    const distance = Math.hypot(q.x - p.x, q.y - p.y);
    if (distance <= bestDistance) {
      best = wall;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Where a drawn wall's end goes (wall-editing): onto an existing wall's end within `reach` board
 * pixels, so walls join, else onto the nearest grid corner. `free` (Alt held) leaves it as is.
 */
export function wallPoint(p: Point, walls: Record<string, Wall>, grid: GridSpec, reach: number, free: boolean): Point {
  if (free) return p;
  let best: Point | null = null;
  let bestDistance = reach;
  for (const wall of Object.values(walls)) {
    for (const end of [wall.a, wall.b]) {
      const distance = Math.hypot(end.x - p.x, end.y - p.y);
      if (distance <= bestDistance) {
        best = end;
        bestDistance = distance;
      }
    }
  }
  return best ?? snapToIntersection(p, grid);
}

/** The topmost fog region under `p` (the last added wins), or null. */
export function fogRegionAt(fog: Record<string, FogRegion>, p: Point): FogRegion | null {
  const regions = Object.values(fog);
  for (let i = regions.length - 1; i >= 0; i--) if (pointInPolygon(p, regions[i]!.points)) return regions[i]!;
  return null;
}

/** Colours offered by the Draw tool. */
export const DRAW_COLORS = [
  { name: "Red", value: 0xe74c3c },
  { name: "Yellow", value: 0xf1c40f },
  { name: "Green", value: 0x2ecc71 },
  { name: "Blue", value: 0x3498db },
  { name: "White", value: 0xecf0f1 },
] as const;
/** Sizes offered for placing an area with a click, in grid units (the common 5e set). A drag sizes it instead. */
export const AREA_SIZES = [5, 10, 15, 20, 30, 40, 60] as const;

/** A mark as the viewer made it: raw points, so a grid change re-derives snapping and sizes. */
export type Mark =
  | { kind: "measure"; from: Point; to: Point; free: boolean }
  | { kind: "draw"; shape: Exclude<DrawShape, "brush">; color: number; from: Point; to: Point }
  | { kind: "stroke"; color: number; points: Point[] }
  | { kind: "area"; shape: AreaShape; size: number; origin: Point; toward: Point; free: boolean; gmOnly?: boolean; width?: number };

/** A placed, shared template as a mark, for drawing and hit testing. Its origin is already snapped. */
export function templateMark(t: AreaTemplate): Extract<Mark, { kind: "area" }> {
  return { kind: "area", shape: t.shape, size: t.size, origin: t.origin, toward: t.toward, free: true, gmOnly: t.gmOnly, width: t.width };
}

export function snapToCellCenter(p: Point, grid: GridSpec): Point {
  return snapTokenCenter(p, 1, grid);
}

export function snapToIntersection(p: Point, grid: GridSpec): Point {
  const snap = (v: number, offset: number) => Math.round((v - offset) / grid.cellSize) * grid.cellSize + offset;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/** `25 ft`, `7.5 ft`: one decimal at most, no trailing `.0`. */
export function formatDistance(units: number, grid: GridSpec): string {
  const rounded = Math.round(units * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${grid.unitLabel}`;
}

/**
 * Distance between two points. Snapped: ends at cell centres, every diagonal step counts as one
 * cell (5e's default; configurable diagonals are KAN-32). Free: straight-line length.
 */
export function measure(from: Point, to: Point, grid: GridSpec, free: boolean) {
  if (free) {
    const units = (Math.hypot(to.x - from.x, to.y - from.y) / grid.cellSize) * grid.unitsPerCell;
    return { from, to, units, label: formatDistance(units, grid) };
  }
  const a = snapToCellCenter(from, grid);
  const b = snapToCellCenter(to, grid);
  const cells = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / grid.cellSize);
  const units = cells * grid.unitsPerCell;
  return { from: a, to: b, units, label: formatDistance(units, grid) };
}

export type AreaGeometry =
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "polygon"; points: Point[] };

/**
 * An area's outline in board pixels. Size is in grid units. A circle's size is its radius; a
 * cone starts at the origin and is as wide as it is long at its far end; a box is a square
 * that starts at the origin (the middle of its near side) and extends toward `toward`, as a
 * 5e cube does. A zero-length aim points right.
 */
export function areaShape(shape: AreaShape, origin: Point, toward: Point, size: number, grid: GridSpec, width?: number): AreaGeometry {
  const length = (size / grid.unitsPerCell) * grid.cellSize;
  if (shape === "circle") return { kind: "circle", center: origin, radius: length };

  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };
  const at = (along: number, across: number): Point => ({
    x: origin.x + dir.x * along + perp.x * across,
    y: origin.y + dir.y * along + perp.y * across,
  });

  if (shape === "cone") return { kind: "polygon", points: [origin, at(length, -length / 2), at(length, length / 2)] };
  if (shape === "line") {
    // Starts at the origin and runs `size` toward the aim, `width` across (one cell by default) (KAN-35).
    const half = (((width ?? grid.unitsPerCell) / grid.unitsPerCell) * grid.cellSize) / 2;
    return { kind: "polygon", points: [at(0, -half), at(length, -half), at(length, half), at(0, half)] };
  }
  const h = length / 2;
  return { kind: "polygon", points: [at(0, -h), at(length, -h), at(length, h), at(0, h)] };
}

/**
 * Where an area's origin lands: the nearest half-cell point (a corner, an edge midpoint or a
 * cell centre, so an aura can sit on a token), unless placed freely (Alt).
 */
export function areaOrigin(p: Point, grid: GridSpec, free: boolean): Point {
  if (free) return p;
  const half = grid.cellSize / 2;
  const snap = (v: number, offset: number) => Math.round((v - offset) / half) * half + offset;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/**
 * An area's size from a drag, in grid units: the distance from the origin to the pointer, so
 * the pointer sits on the shape's far edge. Snapped to whole cells (at least one) unless free.
 */
export function areaSizeFromDrag(origin: Point, to: Point, grid: GridSpec, free: boolean): number {
  const cells = Math.hypot(to.x - origin.x, to.y - origin.y) / grid.cellSize;
  if (free) return Math.max(0.1, Math.round(cells * grid.unitsPerCell * 10) / 10);
  return Math.max(1, Math.round(cells)) * grid.unitsPerCell;
}

/**
 * Points every `step` board pixels from `from` to `to`, both ends included, so a fast eraser
 * drag is tested along its whole path and not only where the pointer events landed.
 */
export function sweepPoints(from: Point, to: Point, step: number): Point[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  }));
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearPolygon(p: Point, points: Point[], tolerance: number): boolean {
  return pointInPolygon(p, points) || points.some((a, i) => distanceToSegment(p, a, points[(i + 1) % points.length]!) <= tolerance);
}

/**
 * Whether the eraser at `p` touches a mark: within `tolerance` board pixels of a line, or on or
 * inside a closed shape (rectangle, circle, area).
 */
export function hitMark(mark: Mark, p: Point, tolerance: number, grid: GridSpec): boolean {
  switch (mark.kind) {
    case "measure": {
      const m = measure(mark.from, mark.to, grid, mark.free);
      return distanceToSegment(p, m.from, m.to) <= tolerance;
    }
    case "draw": {
      const { from, to } = mark;
      if (mark.shape === "line") return distanceToSegment(p, from, to) <= tolerance;
      if (mark.shape === "circle") return Math.hypot(p.x - from.x, p.y - from.y) <= Math.hypot(to.x - from.x, to.y - from.y) + tolerance;
      return (
        p.x >= Math.min(from.x, to.x) - tolerance && p.x <= Math.max(from.x, to.x) + tolerance &&
        p.y >= Math.min(from.y, to.y) - tolerance && p.y <= Math.max(from.y, to.y) + tolerance
      );
    }
    case "stroke":
      return mark.points.some((a, i) => distanceToSegment(p, a, mark.points[i + 1] ?? a) <= tolerance);
    case "area": {
      const shape = areaShape(mark.shape, areaOrigin(mark.origin, grid, mark.free), mark.toward, mark.size, grid, mark.width);
      if (shape.kind === "circle") return Math.hypot(p.x - shape.center.x, p.y - shape.center.y) <= shape.radius + tolerance;
      return nearPolygon(p, shape.points, tolerance);
    }
  }
}
