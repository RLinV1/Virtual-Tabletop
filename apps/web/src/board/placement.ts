import { snapTokenCenter, type CommandInput, type GridSpec, type Point, type RoomState, type TokenStats } from "@vtt/shared";

/**
 * Placing a new token on the board (place-token-on-board). Pure geometry in board coordinates
 * (invariant 8), so it is testable without Pixi.
 */

/** A token the GM has filled in but not yet put down: everything `token.create` needs except where. */
export type TokenDraft = Omit<Extract<CommandInput, { type: "token.create" }>, "position">;

/** What the board draws under the pointer while placing. */
export interface PlacementGhost {
  name: string;
  size: number;
  /** Degrees clockwise, so the direction marker already points where the token will face. */
  rotation: number;
  color: string;
  imageUrl: string | null;
  hidden: boolean;
  /** Drawn as the HP bar, as on the real token. */
  stats: TokenStats;
}

/** Where a token dropped at `p` lands: the centre of the square(s) under it, or `p` itself with Alt. */
export function placementPoint(p: Point, size: number, grid: GridSpec, free: boolean): Point {
  return free ? p : snapTokenCenter(p, size, grid);
}

/** The squares a token centred at `center` covers, as a rectangle in board pixels. */
export function footprint(center: Point, size: number, grid: GridSpec) {
  const edge = size * grid.cellSize;
  return { x: center.x - edge / 2, y: center.y - edge / 2, width: edge, height: edge };
}

/**
 * "Place automatically": fan tokens out around the map's centre instead of stacking them all on
 * one cell, which made the roster and turn order useless the moment there was a second one.
 */
export function autoPlacementPoint(state: RoomState, size: number): Point {
  const map = state.scene.map;
  const center = map ? { x: map.width / 2, y: map.height / 2 } : { x: 1050, y: 700 };
  const count = Object.keys(state.tokens).length;
  const ring = Math.floor(count / 8) + 1;
  const angle = (count % 8) * (Math.PI / 4);
  const spread = state.scene.grid.cellSize * ring;
  return snapTokenCenter(
    { x: center.x + Math.cos(angle) * spread, y: center.y + Math.sin(angle) * spread },
    size,
    state.scene.grid,
  );
}
