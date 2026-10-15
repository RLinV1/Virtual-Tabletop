import { MAX_WALLS_PER_ADD, type CommandInput, type FogRegion, type LibraryMapBoard, type Wall } from "@vtt/shared";
import type { MapDraft } from "./mapDraft";

/** The editor's draft of a library map's board: ids are made here, since a stored board has none. */
export function draftFromBoard(mapUrl: string, board: LibraryMapBoard): MapDraft {
  const walls: Record<string, Wall> = {};
  board.walls.forEach((w, i) => { walls[`draft:w${i}`] = { id: `draft:w${i}`, ...w }; });
  const fog: Record<string, FogRegion> = {};
  board.fog.forEach((f, i) => { fog[`draft:f${i}`] = { id: `draft:f${i}`, ...f }; });
  return { mapUrl, walls, fog };
}

/** The board to store: the draft without its ids. */
export function boardFromDraft(draft: MapDraft): LibraryMapBoard {
  return {
    walls: Object.values(draft.walls).map(({ id: _id, ...wall }) => wall),
    fog: Object.values(draft.fog).map(({ id: _id, ...region }) => region),
  };
}

/** Whether the draft differs from the stored board, ignoring ids and order. */
export function boardChanged(draft: MapDraft, stored: LibraryMapBoard): boolean {
  const key = (board: LibraryMapBoard) => JSON.stringify({
    walls: board.walls.map((w) => JSON.stringify(w)).sort(),
    fog: board.fog.map((f) => JSON.stringify(f)).sort(),
  });
  return key(boardFromDraft(draft)) !== key(stored);
}

type FogAdd = Extract<CommandInput, { type: "fog.replace" }>["add"][number];

/**
 * The commands that add a library map's board to a room that already holds the map: append-only, so
 * the room's own walls and fog stay (ADR 0037). Walls go in batches, fog in one `fog.replace` that
 * removes nothing.
 */
export function commandsForBoard(board: LibraryMapBoard, mapUrl: string): CommandInput[] {
  const commands: CommandInput[] = [];
  for (let i = 0; i < board.walls.length; i += MAX_WALLS_PER_ADD) {
    commands.push({ type: "wall.add", walls: board.walls.slice(i, i + MAX_WALLS_PER_ADD) });
  }
  if (board.fog.length > 0) {
    const add = board.fog.map((region): FogAdd => {
      if (region.shape === "polygon") return { shape: "polygon", points: region.points };
      const xs = region.points.map((p) => p.x);
      const ys = region.points.map((p) => p.y);
      return { shape: "rect", from: { x: Math.min(...xs), y: Math.min(...ys) }, to: { x: Math.max(...xs), y: Math.max(...ys) } };
    });
    commands.push({ type: "fog.replace", removeIds: [], add });
  }
  return commands.map((command) => ({ ...command, expectedMapUrl: mapUrl }));
}
