import { describe, expect, it } from 'vitest';

import type { Participant } from './protocol.js';
import { applyIntent, createRoom, filterForParticipant } from './room.js';

const gm: Participant = { id: 'gm-1', displayName: 'Alex', role: 'gm' };
const player1: Participant = { id: 'player-1', displayName: 'Mira', role: 'player' };
const player2: Participant = { id: 'player-2', displayName: 'Theo', role: 'player' };

describe('applyIntent', () => {
  it('moves a token the actor owns and increments seq (FR-SYNC-04)', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, player1, { type: 'token:move', tokenId: 'kael', x: 5, y: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seq).toBe(1);
    expect(result.state.tokens['kael']).toMatchObject({ x: 5, y: 5 });
  });

  it('rejects moving a token owned by someone else (FR-PL-04)', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, player2, { type: 'token:move', tokenId: 'kael', x: 5, y: 5 });

    expect(result).toMatchObject({ ok: false, code: 'not_owner' });
  });

  it('lets the GM move any token, including unowned NPCs (FR-GM-15)', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, gm, { type: 'token:move', tokenId: 'sentry', x: 2, y: 2 });

    expect(result.ok).toBe(true);
  });

  it('rejects out-of-bounds moves', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, player1, { type: 'token:move', tokenId: 'kael', x: 999, y: 0 });

    expect(result).toMatchObject({ ok: false, code: 'out_of_bounds' });
  });

  it('rejects unknown tokens', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, gm, { type: 'token:move', tokenId: 'nope', x: 1, y: 1 });

    expect(result).toMatchObject({ ok: false, code: 'unknown_token' });
  });

  it('does not mutate the input state', () => {
    const room = createRoom('r1');
    const before = structuredClone(room);
    applyIntent(room, player1, { type: 'token:move', tokenId: 'kael', x: 7, y: 7 });

    expect(room).toEqual(before);
  });

  it('orders concurrent accepted moves deterministically (FR-SYNC-04)', () => {
    const room = createRoom('r1');
    const first = applyIntent(room, player1, { type: 'token:move', tokenId: 'kael', x: 1, y: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyIntent(first.state, player2, { type: 'token:move', tokenId: 'lyra', x: 2, y: 2 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.seq).toBe(first.seq + 1);
  });

  it('does not advance seq on a rejected intent', () => {
    const room = createRoom('r1');
    const result = applyIntent(room, player2, { type: 'token:move', tokenId: 'kael', x: 5, y: 5 });

    expect(result).toMatchObject({ ok: false, currentSeq: 0 });
  });
});

describe('filterForParticipant', () => {
  it('hides hidden tokens from players (FR-GM-23)', () => {
    const room = createRoom('r1');
    const filtered = filterForParticipant(room, player1);

    expect(filtered.tokens['sentry']).toBeUndefined();
    expect(filtered.tokens['kael']).toBeDefined();
  });

  it('shows everything to the GM (FR-GM-16)', () => {
    const room = createRoom('r1');
    const filtered = filterForParticipant(room, gm);

    expect(filtered.tokens['sentry']).toBeDefined();
  });
});
