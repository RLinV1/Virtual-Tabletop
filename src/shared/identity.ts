/**
 * Guest identity without accounts (FR-PL-01, FR-PL-02).
 *
 * A participant is identified by an opaque token the browser keeps in
 * localStorage. The server never stores the token itself — only its hash —
 * and looks participants up by that hash on every (re)connection. Identity
 * therefore survives reloads, backgrounded tabs and transient drops without
 * anyone creating an account.
 *
 * This registry is the in-memory stand-in for the `participants` table
 * described in docs/DESIGN.md §4; the resolution rules live here, pure and
 * testable, so they can move to Postgres unchanged.
 */

import type { Participant, Role } from './protocol.js';

/** guestTokenHash -> participant. */
export type Registry = Record<string, Participant>;

export interface ResolveResult {
  registry: Registry;
  participant: Participant;
  /** True when this hash was already known — i.e. a reconnect, not a new join. */
  returning: boolean;
}

/**
 * Resolve a token hash to a stable participant.
 *
 * Crucially, role is a property of the *participant record*, not of the
 * connection: a GM who reloads is still the GM, no matter how many players
 * joined while they were gone.
 */
export function resolveParticipant(registry: Registry, tokenHash: string): ResolveResult {
  const existing = registry[tokenHash];
  if (existing) {
    return { registry, participant: existing, returning: true };
  }

  const memberCount = Object.keys(registry).length;
  const role: Role = memberCount === 0 ? 'gm' : 'player';
  const participant: Participant = {
    id: role === 'gm' ? 'gm-1' : `player-${memberCount}`,
    displayName: role === 'gm' ? 'GM' : `Player ${memberCount}`,
    role,
  };

  return {
    registry: { ...registry, [tokenHash]: participant },
    participant,
    returning: false,
  };
}
