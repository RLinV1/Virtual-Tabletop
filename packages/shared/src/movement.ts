import { footprintCrossesWall, type Point } from "./geometry";
import { blocksMovement } from "./portals";
import { effectiveTerrain, emptyTerrain, movementTerrain, sweptCrossesWalls } from "./terrain";
import type { RoomState, Token } from "./state";

/** Physical restrictions for an authorized move; fog and sight only conceal, never obstruct. */
export function movementBlocked(state: RoomState, token: Token, to: Point, reposition = false): boolean {
  const grid = state.scene.grid;
  const walls = Object.values(state.walls).filter(blocksMovement);
  const terrain = effectiveTerrain(state.terrain ?? emptyTerrain());
  if (footprintCrossesWall(to, token.size, grid, walls) || movementTerrain(to, to, token.size, grid, terrain).blocked) return true;
  if (reposition) return false;
  if (movementTerrain(token.position, to, token.size, grid, terrain).blocked) return true;
  const ahead = walls.filter((w) => !footprintCrossesWall(token.position, token.size, grid, [w]));
  return sweptCrossesWalls(token.position, to, token.size, grid, ahead);
}
