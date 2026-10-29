/**
 * The animation preview stage's layout and default art (ADR 0038), apart from Pixi so the
 * React panels and the tests can use it: where the grid lines fall, where the stand-ins sit,
 * and how a library map is laid under them. Everything is in the stage's board pixels.
 */

export const STAGE_CELL = 40;

/** The pictures the stage shows until the GM picks their own. */
export const DEFAULT_STAGE_ART = {
  arena: "/img/preview/arena.webp",
  attacker: "/img/preview/attacker.webp",
  target: "/img/preview/target.webp",
} as const;

export type StageSide = "attacker" | "target";
export type StageSlot = "map" | StageSide;

/** A map's own grid: its square size and where its first lines fall, in map image pixels. */
export interface StageMapGrid {
  cellSize: number;
  offsetX: number;
  offsetY: number;
}

/** The GM's own art for the stage; each null keeps the default. Preview only, never saved. */
export interface StageScene {
  map: { url: string; grid: StageMapGrid | null } | null;
  attacker: string | null;
  target: string | null;
}

export const DEFAULT_SCENE: StageScene = { map: null, attacker: null, target: null };

interface Point {
  x: number;
  y: number;
}

/** Where the first grid lines fall, so that a square is centred on the middle of the stage. */
export function stageGridOrigin(width: number, height: number): Point {
  return { x: (width / 2 + STAGE_CELL / 2) % STAGE_CELL, y: (height / 2 + STAGE_CELL / 2) % STAGE_CELL };
}

/**
 * Where the stand-ins sit on a stage of this logical size: each in the middle of a grid square,
 * level with the stage's centre and the same number of squares either side of it.
 */
export function standInPositions(width: number, height: number): { attacker: Point; target: Point } {
  const squares = Math.max(1, Math.round((width * 0.28) / STAGE_CELL));
  const x = squares * STAGE_CELL;
  return { attacker: { x: width / 2 - x, y: height / 2 }, target: { x: width / 2 + x, y: height / 2 } };
}

/** `d` moved by whole squares into [-half a square, half a square). */
function nearestShift(d: number): number {
  const m = ((d % STAGE_CELL) + STAGE_CELL) % STAGE_CELL;
  return m >= STAGE_CELL / 2 ? m - STAGE_CELL : m;
}

/**
 * Where a map image goes on a `width` x `height` stage: its top-left corner and scale.
 *
 * A map with a grid is scaled so its squares are the stage's squares, centred, then nudged by
 * less than half a square so its lines fall on the stage's: tokens stand in the map's own squares.
 * A small map may then leave the stage's edges bare. A map without a grid covers the stage
 * (and `bleed` past each edge, for screen shake) like a CSS cover.
 */
export function mapPlacement(
  map: { width: number; height: number },
  width: number,
  height: number,
  grid: StageMapGrid | null,
  bleed = 0,
): { x: number; y: number; scale: number } {
  if (!grid) {
    const scale = Math.max((width + bleed * 2) / map.width, (height + bleed * 2) / map.height);
    return { x: (width - map.width * scale) / 2, y: (height - map.height * scale) / 2, scale };
  }
  const scale = STAGE_CELL / grid.cellSize;
  const left = (width - map.width * scale) / 2;
  const top = (height - map.height * scale) / 2;
  const origin = stageGridOrigin(width, height);
  return {
    x: left + nearestShift(origin.x - (left + grid.offsetX * scale)),
    y: top + nearestShift(origin.y - (top + grid.offsetY * scale)),
    scale,
  };
}
