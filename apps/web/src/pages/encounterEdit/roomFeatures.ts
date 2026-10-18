import type { TabId } from "../../panels/RoomPanel";

/**
 * What the room page offers. A normal room offers everything; a temporary encounter-editing room
 * (ADR 0033) only what manages the map, fog and tokens. Hiding is a convenience: the server
 * enforces what matters (invariant 7).
 */
export interface RoomFeatures {
  /** Home, participants, share, the activity log, replay and the guide in the top bar. */
  tableChrome: boolean;
  /** The chat dock. */
  chat: boolean;
  /** Turn, departure and keep-seat notices on the board, and the roll card. */
  notices: boolean;
  /** The panel's tabs, in order. */
  tabs: readonly TabId[];
  /** Selection only, with the redundant tool rail hidden. */
  selectOnly: boolean;
  /** Manage: departed players, checkpoints and the Encounter templates section. */
  tableAdmin: boolean;
  /** Edit map: choosing or uploading another map. */
  mapAndWalls: boolean;
}

export const FULL_ROOM: RoomFeatures = {
  tableChrome: true,
  chat: true,
  notices: true,
  tabs: ["play", "tokens", "dice", "gm"],
  selectOnly: false,
  tableAdmin: true,
  mapAndWalls: true,
};

/** A template being edited: Tokens and Manage's grid and fog; walls come from the map. */
export const ENCOUNTER_EDITING: RoomFeatures = {
  tableChrome: false,
  chat: false,
  notices: false,
  tabs: ["tokens", "gm"],
  selectOnly: true,
  tableAdmin: false,
  mapAndWalls: false,
};

/** The tab to show: the chosen one when this room offers it, else its first. */
export const shownTab = (tab: TabId, features: RoomFeatures): TabId => (features.tabs.includes(tab) ? tab : features.tabs[0]!);
