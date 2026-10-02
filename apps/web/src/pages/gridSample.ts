import type { GridSpec, Point } from "@vtt/shared";
import type { BoardSize } from "../board/gridRenderLimit";
import { parseGridDraft, toGridDraft } from "./gridDraft";

export type SampleCount = 1 | 3 | 5;
export interface GridSample {
  /** The first intersection stays fixed when B changes, including reverse quadrants. */
  anchor: Point;
  corner: Point;
  count: SampleCount;
  /** Exact constrained side, before adding it to fractional anchor coordinates. */
  side?: number;
}

export const GRID_CELL_SNAP = 0.5;

/** A canonical offset without rounding away fractional image pixels. */
export function positiveModulo(value: number, size: number): number {
  const remainder = value % size;
  return remainder < 0 ? (remainder + size) % size : remainder === 0 ? 0 : remainder;
}

/** Constrain to the dominant axis and stop at the first image edge. */
export function drawGridSample(anchor: Point, pointer: Point, count: SampleCount, map: BoardSize,
  cellSizeStep = 0): GridSample | null {
  if (![anchor.x, anchor.y, pointer.x, pointer.y].every(Number.isFinite)
    || anchor.x < 0 || anchor.y < 0 || anchor.x > map.width || anchor.y > map.height) return null;
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  const maximum = Math.min(
    sx > 0 ? map.width - anchor.x : anchor.x,
    sy > 0 ? map.height - anchor.y : anchor.y);
  let side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maximum);
  if (cellSizeStep > 0) {
    const step = cellSizeStep * count;
    side = Math.min(Math.round(side / step) * step, Math.floor(maximum / step) * step);
  }
  if (side <= 0) return null;
  return { anchor, corner: { x: anchor.x + sx * side, y: anchor.y + sy * side }, count, side };
}

export function moveGridSample(sample: GridSample, delta: Point, map: BoardSize): GridSample {
  const dx = Math.min(map.width - Math.max(sample.anchor.x, sample.corner.x),
    Math.max(-Math.min(sample.anchor.x, sample.corner.x), delta.x));
  const dy = Math.min(map.height - Math.max(sample.anchor.y, sample.corner.y),
    Math.max(-Math.min(sample.anchor.y, sample.corner.y), delta.y));
  return {
    ...sample,
    anchor: { x: sample.anchor.x + dx, y: sample.anchor.y + dy },
    corner: { x: sample.corner.x + dx, y: sample.corner.y + dy },
  };
}

/** Nearest anchor with a snapped canonical phase, constrained by both sample corners. */
function snapGridAnchor(value: number, size: number, minimum: number, maximum: number, step: number): number | null {
  const lastPhase = Math.ceil(size / step) - 1;
  const periods = new Set<number>();
  for (const point of [value, minimum, maximum]) {
    const period = Math.floor(point / size);
    for (const delta of [-1, 0, 1]) periods.add(period + delta);
  }
  let best: number | null = null;
  for (const period of periods) {
    const base = period * size;
    const first = Math.max(0, Math.ceil((minimum - base) / step));
    const last = Math.min(lastPhase, Math.floor((maximum - base) / step));
    if (first > last) continue;
    const phase = Math.min(last, Math.max(first, Math.round((value - base) / step)));
    const candidate = base + phase * step;
    if (candidate < minimum || candidate > maximum) continue;
    if (best === null || Math.abs(candidate - value) < Math.abs(best - value)
      || (Math.abs(candidate - value) === Math.abs(best - value) && candidate > best)) best = candidate;
  }
  return best;
}

/** Translate the whole sample to snapped X/Y offsets without changing its spacing. */
export function snapGridSampleOffsets(sample: GridSample, map: BoardSize, step: number): GridSample | null {
  if (step <= 0) return sample;
  const side = sample.side ?? Math.abs(sample.corner.x - sample.anchor.x);
  const size = side / sample.count;
  if (!Number.isFinite(size) || size <= 0) return null;
  const sx = sample.corner.x < sample.anchor.x ? -1 : 1;
  const sy = sample.corner.y < sample.anchor.y ? -1 : 1;
  const x = snapGridAnchor(sample.anchor.x, size, sx < 0 ? side : 0, sx > 0 ? map.width - side : map.width, step);
  const y = snapGridAnchor(sample.anchor.y, size, sy < 0 ? side : 0, sy > 0 ? map.height - side : map.height, step);
  if (x === null || y === null) return null;
  return { ...sample, anchor: { x, y }, corner: { x: x + sx * side, y: y + sy * side } };
}

/** Validate through the same limits as numeric drafts and preserve scale and line style. */
export function gridFromSample(sample: GridSample, grid: GridSpec, map: BoardSize, offsetStep = 0): GridSpec | null {
  const side = sample.side ?? Math.abs(sample.corner.x - sample.anchor.x);
  const cellSize = side / sample.count;
  if (![sample.anchor.x, sample.anchor.y, sample.corner.x, sample.corner.y].every(Number.isFinite)
    || Math.min(sample.anchor.x, sample.corner.x, sample.anchor.y, sample.corner.y) < 0
    || Math.max(sample.anchor.x, sample.corner.x) > map.width
    || Math.max(sample.anchor.y, sample.corner.y) > map.height
    || Math.abs(Math.abs(sample.corner.x - sample.anchor.x) - side) > Number.EPSILON * Math.max(map.width, map.height) * 4
    || Math.abs(Math.abs(sample.corner.y - sample.anchor.y) - Math.abs(sample.corner.x - sample.anchor.x))
      > Number.EPSILON * Math.max(map.width, map.height) * 4
    || !Number.isFinite(cellSize) || cellSize <= 0) return null;
  const offset = (value: number) => {
    const raw = positiveModulo(value, cellSize);
    if (offsetStep <= 0) return raw;
    // An exact period can produce a remainder just below cellSize in floating point.
    const tolerance = Number.EPSILON * Math.max(map.width, map.height) * 4;
    if (raw <= tolerance || cellSize - raw <= tolerance) return 0;
    const snapped = Math.round(raw / offsetStep) * offsetStep;
    return snapped >= cellSize ? 0 : snapped;
  };
  return parseGridDraft(toGridDraft({
    ...grid,
    cellSize,
    offsetX: offset(sample.anchor.x),
    offsetY: offset(sample.anchor.y),
  }), map);
}

/** Seed a square toward the image interior, even when A is on an edge. */
export function seedGridSample(anchor: Point, cellSize: number, count: SampleCount, map: BoardSize,
  cellSizeStep = 0): GridSample | null {
  const sx = map.width - anchor.x >= anchor.x ? 1 : -1;
  const sy = map.height - anchor.y >= anchor.y ? 1 : -1;
  return drawGridSample(anchor, { x: anchor.x + sx * cellSize * count, y: anchor.y + sy * cellSize * count }, count, map, cellSizeStep);
}

/** Arrow direction changes spacing in the current quadrant; an optional step nudges each cell. */
export function adjustGridSampleCorner(sample: GridSample, delta: Point, map: BoardSize, cellSizeStep = 0): GridSample | null {
  const sx = sample.corner.x < sample.anchor.x ? -1 : 1;
  const sy = sample.corner.y < sample.anchor.y ? -1 : 1;
  const change = delta.x ? delta.x * sx : delta.y * sy;
  const currentSide = sample.side ?? Math.abs(sample.corner.x - sample.anchor.x);
  let side = currentSide + change;
  if (cellSizeStep > 0) {
    const position = currentSide / sample.count / cellSizeStep;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(position)) * 4;
    const index = change > 0 ? Math.floor(position + tolerance) : Math.ceil(position - tolerance);
    side = (index + change) * cellSizeStep * sample.count;
  }
  return side > 0 ? drawGridSample(sample.anchor,
    { x: sample.anchor.x + sx * side, y: sample.anchor.y + sy * side }, sample.count, map, cellSizeStep) : null;
}

/** Apply an inverse SVG screen transform; translation, zoom and letterboxing all cancel. */
export function screenToMap(point: Point, inverse: Pick<DOMMatrix, "a" | "b" | "c" | "d" | "e" | "f">): Point {
  return { x: inverse.a * point.x + inverse.c * point.y + inverse.e,
    y: inverse.b * point.x + inverse.d * point.y + inverse.f };
}
