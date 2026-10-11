import {
  MAX_WALLS_PER_ADD, MAX_WALLS_PER_REMOVE,
  type CommandInput, type FogRegion, type Point, type RoomState, type Wall,
} from "@vtt/shared";

/**
 * The map editor's private copy of the room's walls and fog (map-editor-drafts). The Walls and Fog
 * steps edit it; nothing reaches the room until Save sends the difference with existing commands.
 */
export interface MapDraft {
  /** The applied map this draft belongs to. */
  mapUrl: string;
  walls: Record<string, Wall>;
  fog: Record<string, FogRegion>;
}

/** Walls and fog drawn in the editor carry ids with this prefix; the room gives them real ones on Save. */
export const DRAFT_ID = "draft:";

export function draftFrom(state: Pick<RoomState, "scene" | "walls" | "fog">): MapDraft {
  return { mapUrl: state.scene.map?.url ?? "", walls: state.walls, fog: state.fog };
}

const pointKey = (p: Point) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/** A wall's identity for the diff: its endpoints to a tenth of a pixel, in either direction. */
function wallKey(wall: { a: Point; b: Point }): string {
  const [a, b] = [pointKey(wall.a), pointKey(wall.b)];
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A fog region's identity for the diff: its shape and corners, so ids never need to match. */
const fogKey = (region: FogRegion) => `${region.shape}:${region.points.map(pointKey).join(" ")}`;

/** A fog region as `fog.add` takes it: a rectangle by its corners, or the polygon's points. */
function fogAdd(region: FogRegion): Extract<CommandInput, { type: "fog.add" }>["region"] {
  if (region.shape === "polygon") return { shape: "polygon", points: region.points };
  const xs = region.points.map((p) => p.x);
  const ys = region.points.map((p) => p.y);
  return { shape: "rect", from: { x: Math.min(...xs), y: Math.min(...ys) }, to: { x: Math.max(...xs), y: Math.max(...ys) } };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The commands Save sends, in order (map-editor-drafts D2): new fog first, then wall removals and
 * additions, then fog removals, so fog always hides before it reveals. Walls and fog are matched
 * by geometry, not id: a detection that keeps an existing wall leaves it alone, and once a save
 * reaches the room the draft and the room agree again.
 */
export function planDraftSave(room: Pick<RoomState, "walls" | "fog">, draft: MapDraft): CommandInput[] {
  const commands: CommandInput[] = [];
  const roomFogKeys = new Set(Object.values(room.fog).map(fogKey));
  const draftFogKeys = new Set(Object.values(draft.fog).map(fogKey));
  for (const region of Object.values(draft.fog)) {
    if (!roomFogKeys.has(fogKey(region))) commands.push({ type: "fog.add", region: fogAdd(region) });
  }

  const roomWalls = Object.values(room.walls);
  const draftWalls = Object.values(draft.walls);
  const draftKeys = new Set(draftWalls.map(wallKey));
  const roomKeys = new Set(roomWalls.map(wallKey));
  if (draftWalls.length === 0 && roomWalls.length > 0) {
    commands.push({ type: "wall.clear" });
  } else {
    const removed = roomWalls.filter((w) => !draftKeys.has(wallKey(w))).map((w) => w.id);
    for (const wallIds of chunks(removed, MAX_WALLS_PER_REMOVE)) commands.push({ type: "wall.remove", wallIds });
  }
  const added = new Map<string, { a: Point; b: Point }>();
  for (const w of draftWalls) {
    const key = wallKey(w);
    if (!roomKeys.has(key) && !added.has(key)) added.set(key, { a: w.a, b: w.b });
  }
  for (const walls of chunks([...added.values()], MAX_WALLS_PER_ADD)) commands.push({ type: "wall.add", walls });

  for (const region of Object.values(room.fog)) {
    if (!draftFogKeys.has(fogKey(region))) commands.push({ type: "fog.remove", regionId: region.id });
  }
  return commands;
}

/** Whether Save would send anything. */
export const draftDirty = (room: Pick<RoomState, "walls" | "fog">, draft: MapDraft) => planDraftSave(room, draft).length > 0;

/**
 * A wall or fog command applied to the draft instead of the room. `newId` names anything new.
 * Returns null for a command the draft doesn't hold.
 */
export function applyToDraft(draft: MapDraft, command: CommandInput, newId: () => string): MapDraft | null {
  switch (command.type) {
    case "wall.add": {
      const walls = { ...draft.walls };
      for (const { a, b } of command.walls) {
        const id = newId();
        walls[id] = { id, a, b };
      }
      return { ...draft, walls };
    }
    case "wall.remove": {
      const walls = { ...draft.walls };
      for (const id of command.wallIds) delete walls[id];
      return { ...draft, walls };
    }
    case "wall.clear":
      return { ...draft, walls: {} };
    case "fog.add": {
      const { region } = command;
      const points: Point[] = region.shape === "rect"
        ? [
            { x: Math.min(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
            { x: Math.max(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
            { x: Math.max(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
            { x: Math.min(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
          ]
        : region.points;
      const id = newId();
      return { ...draft, fog: { ...draft.fog, [id]: { id, shape: region.shape, points } } };
    }
    case "fog.remove": {
      const fog = { ...draft.fog };
      delete fog[command.regionId];
      return { ...draft, fog };
    }
    default:
      return null;
  }
}

/** Walls from a finished detection, as the draft's whole set of walls; a wall found twice counts once. */
export function withDetectedWalls(draft: MapDraft, detected: readonly { a: Point; b: Point }[], newId: () => string): MapDraft {
  const walls: Record<string, Wall> = {};
  const seen = new Set<string>();
  for (const { a, b } of detected) {
    const key = wallKey({ a, b });
    if (seen.has(key)) continue;
    seen.add(key);
    const id = newId();
    walls[id] = { id, a, b };
  }
  return { ...draft, walls };
}
