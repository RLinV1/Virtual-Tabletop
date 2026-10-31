import { effectiveTerrain, emptyTerrain, movementTerrain, movementRouteKnown, sweptCrossesWalls, footprintCrossesWall, blocksMovement, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import { formatDistance } from "./tools";

export type MovementPreview = { label: string; obstruction: "blocked" | "unknown" | "clear" };

export function movementPreview(state: RoomState, you: Participant, token: Token, from: Point, to: Point, free = false, reposition = false): MovementPreview {
  const grid = state.scene.grid;
  const runs = you.role === "gm" ? effectiveTerrain(state.terrain ?? emptyTerrain()) : state.terrainView?.runs ?? [];
  const result = movementTerrain(from, to, token.size, grid, runs, free);
  const unknown = you.role !== "gm" && !movementRouteKnown(state, from, to, token.size);
  const walls = Object.values(state.walls).filter(blocksMovement);
  const destination = movementTerrain(to, to, token.size, grid, runs).blocked || footprintCrossesWall(to, token.size, grid, walls);
  const obstruction = destination || (!reposition && (result.blocked || sweptCrossesWalls(from, to, token.size, grid, walls.filter((w) => !footprintCrossesWall(from, token.size, grid, [w])))));
  const cost = unknown ? " · Cost unknown" : Math.abs(result.cost - result.distance) > 1e-8 ? ` · Cost ${formatDistance(result.cost, grid)}` : "";
  return { label: `${formatDistance(result.distance, grid)}${cost}${reposition ? " · Reposition" : ""}`, obstruction: obstruction ? "blocked" : unknown ? "unknown" : "clear" };
}

export function movementReadout(...args: Parameters<typeof movementPreview>): string {
  return movementPreview(...args).label;
}
