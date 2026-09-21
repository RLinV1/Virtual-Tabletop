/**
 * The authoritative room kernel.
 *
 * Pure functions only — no I/O, no sockets, no clock. The server owns the
 * single mutable copy of RoomState and routes every intent through
 * `applyIntent`; this is what makes the system server-authoritative
 * (FR-SYNC-01) and testable without a network.
 */

import { BOARD, type Intent, type Participant, type RejectionCode, type RoomState, type Token } from './protocol.js';

export interface AcceptedResult {
  ok: true;
  state: RoomState;
  tokenId: string;
  x: number;
  y: number;
  seq: number;
}

export interface RejectedResult {
  ok: false;
  code: RejectionCode;
  currentSeq: number;
}

export type ApplyResult = AcceptedResult | RejectedResult;

export function createRoom(roomId: string): RoomState {
  const tokens: Token[] = [
    { id: 'kael', name: 'Kael', x: 3, y: 4, ownerId: 'player-1', hidden: false },
    { id: 'lyra', name: 'Lyra', x: 6, y: 5, ownerId: 'player-2', hidden: false },
    { id: 'sentry', name: 'Sentry', x: 14, y: 3, ownerId: null, hidden: true },
  ];

  return {
    roomId,
    seq: 0,
    gridSize: BOARD.cellPx,
    tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
  };
}

/**
 * Validate and apply one intent.
 *
 * Conflicting concurrent moves are not merged: the server accepts one and
 * rejects the other, and rejection is explicit so the client can roll back
 * its optimistic render (docs/DESIGN.md §2.3).
 */
export function applyIntent(state: RoomState, actor: Participant, intent: Intent): ApplyResult {
  const token = state.tokens[intent.tokenId];

  if (!token) {
    return { ok: false, code: 'unknown_token', currentSeq: state.seq };
  }

  // FR-GM-15 / FR-PL-04: owner-only control, GM may move anything.
  if (actor.role !== 'gm' && token.ownerId !== actor.id) {
    return { ok: false, code: 'not_owner', currentSeq: state.seq };
  }

  if (!isInBounds(intent.x, intent.y)) {
    return { ok: false, code: 'out_of_bounds', currentSeq: state.seq };
  }

  // FR-SYNC-04: one monotonic counter per room, incremented only on accept.
  const seq = state.seq + 1;
  const moved: Token = { ...token, x: intent.x, y: intent.y };

  return {
    ok: true,
    state: { ...state, seq, tokens: { ...state.tokens, [token.id]: moved } },
    tokenId: token.id,
    x: moved.x,
    y: moved.y,
    seq,
  };
}

/**
 * Strip information a participant is not allowed to see, on the server,
 * before it ever reaches the wire (FR-GM-23).
 */
export function filterForParticipant(state: RoomState, actor: Participant): RoomState {
  if (actor.role === 'gm') return state;

  const visible = Object.values(state.tokens).filter((t) => !t.hidden);
  return { ...state, tokens: Object.fromEntries(visible.map((t) => [t.id, t])) };
}

export function isInBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < BOARD.widthCells && y < BOARD.heightCells;
}
