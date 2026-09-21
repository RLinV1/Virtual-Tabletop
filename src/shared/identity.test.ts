import { describe, expect, it } from 'vitest';

import { resolveParticipant, type Registry } from './identity.js';

describe('resolveParticipant', () => {
  it('makes the first participant the GM', () => {
    const { participant } = resolveParticipant({}, 'hash-a');
    expect(participant.role).toBe('gm');
  });

  it('makes subsequent participants players', () => {
    const first = resolveParticipant({}, 'hash-a');
    const second = resolveParticipant(first.registry, 'hash-b');
    expect(second.participant.role).toBe('player');
  });

  it('returns the same participant for the same token hash (FR-PL-02)', () => {
    const first = resolveParticipant({}, 'hash-a');
    const again = resolveParticipant(first.registry, 'hash-a');

    expect(again.returning).toBe(true);
    expect(again.participant).toEqual(first.participant);
  });

  it('keeps the GM as GM after a reconnect, even if players joined meanwhile', () => {
    // This is the bug the first prototype had: role came from connection
    // order, so a GM who reloaded came back demoted to player.
    const gm = resolveParticipant({}, 'gm-hash');
    const withPlayer = resolveParticipant(gm.registry, 'player-hash');
    const gmReconnects = resolveParticipant(withPlayer.registry, 'gm-hash');

    expect(gmReconnects.participant.role).toBe('gm');
    expect(gmReconnects.participant.id).toBe(gm.participant.id);
  });

  it('keeps a player bound to the same identity across reconnects (FR-PL-05)', () => {
    const gm = resolveParticipant({}, 'gm-hash');
    const player = resolveParticipant(gm.registry, 'player-hash');
    const rejoin = resolveParticipant(player.registry, 'player-hash');

    expect(rejoin.participant.id).toBe(player.participant.id);
    expect(rejoin.registry).toEqual(player.registry);
  });

  it('treats an unknown token as a new participant', () => {
    const gm = resolveParticipant({}, 'gm-hash');
    const stranger = resolveParticipant(gm.registry, 'other-hash');

    expect(stranger.returning).toBe(false);
    expect(stranger.participant.id).not.toBe(gm.participant.id);
  });

  it('does not mutate the registry it is given', () => {
    const registry: Registry = {};
    resolveParticipant(registry, 'hash-a');
    expect(registry).toEqual({});
  });
});
