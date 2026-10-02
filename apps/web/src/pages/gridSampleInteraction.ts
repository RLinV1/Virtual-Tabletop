import type { GridSpec, Point } from "@vtt/shared";
import type { BoardSize } from "../board/gridRenderLimit";
import { adjustGridSampleCorner, drawGridSample, gridFromSample, moveGridSample, snapGridSampleOffsets, type GridSample, type SampleCount } from "./gridSample";

export type Anchor = "A" | "B";
export type Placement =
  | { stage: "awaiting-a" }
  | { stage: "awaiting-b"; anchor: Point }
  | { stage: "placed"; sample: GridSample }
  | { stage: "repositioning"; selected: Anchor; sample: GridSample };
export const EMPTY_PLACEMENT: Placement = { stage: "awaiting-a" };

type PlacementAction =
  | { type: "place"; point: Point; cellSizeStep?: number; offsetStep?: number }
  | { type: "select"; anchor: Anchor }
  | { type: "confirm" }
  | { type: "adjust"; anchor: Anchor; delta: Point; cellSizeStep?: number; offsetStep?: number }
  | { type: "count"; count: SampleCount }
  | { type: "reset" };
interface PlacementResult { placement: Placement; grid?: GridSpec; invalid?: boolean }

export function repositionGridSample(sample: GridSample, anchor: Anchor, point: Point, map: BoardSize,
  cellSizeStep = 0, offsetStep = 0): GridSample | null {
  const candidate = anchor === "A"
    ? moveGridSample(sample, { x: point.x - sample.anchor.x, y: point.y - sample.anchor.y }, map)
    : drawGridSample(sample.anchor, point, sample.count, map, cellSizeStep);
  return candidate && snapGridSampleOffsets(candidate, map, offsetStep);
}

/** Durable placement transitions. Preview and gesture events never enter the form draft. */
export function transitionPlacement(placement: Placement, action: PlacementAction, count: SampleCount,
  grid: GridSpec, map: BoardSize): PlacementResult {
  if (action.type === "reset") return { placement: EMPTY_PLACEMENT };
  if (action.type === "confirm") return { placement: placement.stage === "repositioning"
    ? { stage: "placed", sample: placement.sample } : placement };
  const sample = "sample" in placement ? placement.sample : null;
  if (action.type === "select") return { placement: sample
    ? { stage: "repositioning", selected: action.anchor, sample } : placement };
  if (action.type === "place" && placement.stage === "awaiting-a") {
    const { x, y } = action.point;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > map.width || y > map.height) return { placement, invalid: true };
    const step = action.offsetStep ?? 0;
    const snap = (value: number, maximum: number) => step > 0
      ? Math.min(Math.round(value / step) * step, Math.floor(maximum / step) * step) : value;
    return { placement: { stage: "awaiting-b", anchor: { x: snap(x, map.width), y: snap(y, map.height) } } };
  }
  let candidate: GridSample | null = null;
  if (action.type === "place") {
    if (placement.stage === "awaiting-b") candidate = drawGridSample(placement.anchor, action.point, count, map, action.cellSizeStep);
    else if (placement.stage === "repositioning") candidate = repositionGridSample(placement.sample, placement.selected, action.point, map, action.cellSizeStep);
    else return { placement };
  } else if (action.type === "count") {
    if (!sample) return { placement };
    candidate = { ...sample, count: action.count };
  } else if (action.type === "adjust") {
    if (!sample) return { placement };
    candidate = action.anchor === "A" ? moveGridSample(sample, action.delta, map)
      : adjustGridSampleCorner(sample, action.delta, map, action.cellSizeStep);
  }
  const offsetStep = "offsetStep" in action ? action.offsetStep ?? 0 : 0;
  if (candidate && offsetStep > 0) candidate = snapGridSampleOffsets(candidate, map, offsetStep);
  const valid = candidate && gridFromSample(candidate, grid, map, offsetStep);
  if (!candidate || !valid) return { placement, invalid: true };
  return { placement: action.type !== "place" && placement.stage === "repositioning"
    ? { ...placement, sample: candidate } : { stage: "placed", sample: candidate }, grid: valid };
}

export const CLICK_MOVEMENT_LIMIT = 6;
export interface GesturePointer {
  id: number;
  type: string;
  start: Point;
  current: Point;
  anchor: Anchor | null;
}
export interface PointerGesture {
  pointers: GesturePointer[];
  navigating: boolean;
  multiTouch: boolean;
  interrupted: boolean;
}
export const EMPTY_GESTURE: PointerGesture = { pointers: [], navigating: false, multiTouch: false, interrupted: false };

/** Retain the contact ledger until release, but stop navigation and placement. */
export function interruptPointerGesture(gesture: PointerGesture): PointerGesture {
  return gesture.pointers.length ? { ...gesture, navigating: true, interrupted: true } : EMPTY_GESTURE;
}

export function beginPointerGesture(gesture: PointerGesture, pointer: GesturePointer, navigate: boolean): PointerGesture {
  const remaining = gesture.pointers.filter((p) => p.id !== pointer.id);
  // A new down with the same id proves an unobserved previous release has ended.
  const prior = remaining.length ? gesture : EMPTY_GESTURE;
  const pointers = [...remaining, pointer];
  const multiTouch = prior.multiTouch || pointers.filter((p) => p.type === "touch").length > 1;
  return { pointers, multiTouch, navigating: prior.navigating || navigate || multiTouch, interrupted: prior.interrupted };
}

export function movePointerGesture(gesture: PointerGesture, id: number, point: Point): PointerGesture {
  const pointers = gesture.pointers.map((p) => p.id === id ? { ...p, current: point } : p);
  return { ...gesture, pointers, navigating: gesture.navigating || pointers.some((p) =>
    Math.hypot(p.current.x - p.start.x, p.current.y - p.start.y) > CLICK_MOVEMENT_LIMIT) };
}

/** A cancelled pointer cannot leave a second touch eligible for placement. */
export function finishPointerGesture(gesture: PointerGesture, id: number, cancelled = false): {
  gesture: PointerGesture; click: GesturePointer | null;
} {
  const pointer = gesture.pointers.find((p) => p.id === id);
  const pointers = gesture.pointers.filter((p) => p.id !== id);
  return { gesture: pointers.length ? { ...gesture, pointers, navigating: gesture.navigating || cancelled } : EMPTY_GESTURE,
    click: pointer && !cancelled && !gesture.navigating && !gesture.multiTouch ? pointer : null };
}
