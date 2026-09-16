/**
 * Wire protocol shared by client and server.
 *
 * Clients send *intents*; the server validates them and broadcasts *events*.
 * Clients never mutate authoritative state locally without a server event
 * confirming it (see docs/DESIGN.md §4 — FR-SYNC-01).
 */

export type Role = 'gm' | 'player';

export interface Token {
  id: string;
  name: string;
  /** Board coordinates, not screen coordinates (FR-GM-05). */
  x: number;
  y: number;
  /** null = unowned / GM-controlled NPC (FR-GM-10). */
  ownerId: string | null;
  /** Hidden tokens are filtered out of player payloads (FR-GM-16, FR-GM-23). */
  hidden: boolean;
}

export interface Participant {
  id: string;
  displayName: string;
  role: Role;
}

export interface RoomState {
  roomId: string;
  /** Monotonically increasing per room; orders committed actions (FR-SYNC-04). */
  seq: number;
  gridSize: number;
  tokens: Record<string, Token>;
}

/** Client -> server. The server may reject any of these. */
export type Intent = {
  type: 'token:move';
  tokenId: string;
  x: number;
  y: number;
};

/** Server -> client. These are facts; clients render them. */
export type ServerEvent =
  | { type: 'state:snapshot'; state: RoomState; you: Participant }
  | { type: 'token:moved'; tokenId: string; x: number; y: number; seq: number }
  | { type: 'intent:rejected'; code: RejectionCode; currentSeq: number };

export type RejectionCode =
  | 'unknown_token'
  | 'not_owner'
  | 'out_of_bounds';

export const SOCKET_EVENTS = {
  /** Client emits an intent. */
  intent: 'intent',
  /** Server emits an authoritative event. */
  event: 'event',
} as const;

export const BOARD = {
  widthCells: 20,
  heightCells: 12,
  cellPx: 48,
} as const;
