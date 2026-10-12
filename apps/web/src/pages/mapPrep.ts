import { normalizeLegacyGridForBoard, type Command, type GridSpec, type MapImage } from "@vtt/shared";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";

/**
 * A map being prepared before the table sees it (KAN-59, FRONTEND-CONTRACT §13.2): the chosen
 * image and its grid draft, held by the GM's browser only. Nothing reaches the room until Apply.
 */
export interface MapPrep {
  map: MapImage;
  /** The grid the draft started from, to tell an edited draft from an untouched one. */
  initial: GridSpec;
  draft: GridDraft;
}

/**
 * A fresh draft for `map`: a library map's saved grid when it has one, otherwise the room's
 * current grid, since the GM usually lines that up next. Either way it is fitted to this map
 * (offsets normalised, cells at least the map's minimum), so the untouched draft is valid.
 */
export function startPrep(map: MapImage, savedGrid: GridSpec | null | undefined, currentGrid: GridSpec): MapPrep {
  const initial = normalizeLegacyGridForBoard(savedGrid ?? currentGrid, map);
  return { map, initial, draft: toGridDraft(initial) };
}

/** Whether closing would lose alignment work: the draft no longer matches where it started. */
export function prepDirty(prep: MapPrep): boolean {
  const parsed = parseGridDraft(prep.draft, prep.map);
  return parsed === null || !gridsEqual(parsed, prep.initial);
}

/** The one command Apply sends: map and grid together, a single `MapSet` (ADR 0004). Null while the grid is invalid. */
export function prepCommand(prep: MapPrep): Extract<Command, { type: "scene.setMap" }> | null {
  const grid = parseGridDraft(prep.draft, prep.map);
  return grid ? { type: "scene.setMap", map: prep.map, grid } : null;
}
