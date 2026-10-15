import { type FogRegion, type LibraryMapBoard, type Wall } from "@vtt/shared";
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
