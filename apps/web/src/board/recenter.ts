import type { Point } from "@vtt/shared";

interface Size {
  width: number;
  height: number;
}

/**
 * Where the world container goes when the canvas changes size, so the map point that was
 * at the centre of the viewport stays there (room-sidebar-layout).
 *
 * The world point under the centre is `(size/2 - pos) / scale`; keeping it under the new
 * centre gives `pos + (next - old) / 2`. Scale cancels out, so zoom is untouched.
 */
export function recenterOnResize(position: Point, old: Size, next: Size): Point {
  return {
    x: position.x + (next.width - old.width) / 2,
    y: position.y + (next.height - old.height) / 2,
  };
}
