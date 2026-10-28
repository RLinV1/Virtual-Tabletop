import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { LibraryAsset } from "@vtt/shared";
import { whenThisDeviceSignsOut } from "../../account/accountStore";
import type { StageMapGrid, StageScene, StageSlot } from "../../board/previewStage";

/**
 * The library art the GM chose to preview animations on: a map and the two stand-ins' token art.
 *
 * It belongs to the preview, not to any animation: nothing here is saved with an animation or sent
 * anywhere. It lasts for this visit, so every animation opened afterwards plays on the same stage,
 * but is never written to browser storage, which keeps no account data (ADR 0017 C3); signing out
 * drops it.
 */
export interface StagePick {
  /** The library asset's id, or a built-in's `builtin:` id. */
  id: string;
  name: string;
  url: string;
  /** A map's own grid, so its squares line up with the stage's; null for token art. */
  grid: StageMapGrid | null;
}

export type StagePicks = Readonly<Record<StageSlot, StagePick | null>>;

const NONE: StagePicks = { map: null, attacker: null, target: null };
const store = createStore<StagePicks>(() => NONE);
whenThisDeviceSignsOut(() => store.setState(NONE, true));

export const useStagePicks = (): StagePicks => useStore(store);

export function pickForStage(slot: StageSlot, asset: LibraryAsset): void {
  const grid = asset.kind === "map" && asset.grid
    ? { cellSize: asset.grid.cellSize, offsetX: asset.grid.offsetX, offsetY: asset.grid.offsetY }
    : null;
  store.setState({ [slot]: { id: asset.id, name: asset.name, url: asset.url, grid } });
}

/** Back to the default art for one slot. Stable, so it can be handed to effects as is. */
export function clearStagePick(slot: StageSlot): void {
  store.setState({ [slot]: null });
}

export function clearAllStagePicks(): void {
  store.setState(NONE, true);
}

/** What the preview stage should draw for these picks. */
export function stageScene(picks: StagePicks): StageScene {
  return {
    map: picks.map ? { url: picks.map.url, grid: picks.map.grid } : null,
    attacker: picks.attacker?.url ?? null,
    target: picks.target?.url ?? null,
  };
}
