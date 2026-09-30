import type { Point } from "@vtt/shared";

interface Size {
  width: number;
  height: number;
}

/**
 * Screen distance a press must travel before it counts as a deliberate pan. Above touch
 * jitter, below any real drag (FR-TAC-01, KAN-54).
 */
export const PAN_THRESHOLD_PX = 4;

/** Whether a drag has moved far enough from where it started to be a manual pan. */
export function exceedsPanThreshold(start: Point, current: Point): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= PAN_THRESHOLD_PX;
}

/**
 * What a canvas resize does to the camera: refit while the viewer has not moved it,
 * keep the centred map point once they have, nothing when the size did not change.
 */
export function resizeAction(autoFit: boolean, old: Size, next: Size): "refit" | "recenter" | "none" {
  if (next.width <= 0 || next.height <= 0) return "none";
  if (next.width === old.width && next.height === old.height) return "none";
  return autoFit ? "refit" : "recenter";
}

/** Whether a wheel or pinch step really changed the zoom (a step at the limit does not). */
export function zoomChangesScale(before: number, after: number): boolean {
  return Math.abs(after - before) > 1e-9;
}

/**
 * Whether a two-finger gesture moved the camera on purpose: it zoomed, or its midpoint
 * travelled past the pan threshold from where the fingers came down (a two-finger pan
 * at constant spread keeps the scale but still moves the map).
 */
export function pinchIsManual(start: Point, midpoint: Point, scaleBefore: number, scaleAfter: number): boolean {
  return zoomChangesScale(scaleBefore, scaleAfter) || exceedsPanThreshold(start, midpoint);
}
