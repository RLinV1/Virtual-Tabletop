# ADR 0023: Creature templates preserve starting HP and named attacks

**Status:** Proposed; implemented under explicit user direction (2026-10-05). Separate architecture review is not recorded.
**Owner:** Real-Time Architecture (Raymond) · **Amends:** ADR 0012 and ADR 0020 · **Ticket:** KAN-70

**Authorization:** The user explicitly requested saving token attacks, continuing this implementation, creating a PR, and merging it after CodeRabbit finishes. That instruction authorizes the implementation and merge and takes precedence over the repository's review workflow for this task. It is distinct from a separate architecture review or sign-off, which has not been recorded; this ADR therefore remains proposed. CodeRabbit reviewed PR 85 and raised the architecture-review record as its actionable finding.

## Context

KAN-70 includes HP as well as Max HP in a reusable template. The merged creature implementation saves only Max HP. Saving a wounded token therefore loses its current HP, and placing it silently refills its health.

## Decision

Add nullable `hp` to the creature request, response and persistence record, using the existing `TokenStats.hp` bounds (integer -999 through 9999). Migration `0009_creature_starting_hp` adds a nullable integer to `library_creatures`. Existing rows remain null; no backfill is needed. Older create requests default to null and partial updates that omit HP leave it unchanged.

The creature form exposes Starting HP separately from Max HP. Blank/null means start at Max HP, preserving the existing creature behavior. Explicit zero and negative HP are copied without falling back. Save as creature prefills the token's current HP; From creature copies that HP into the ordinary token command. The response type permits an omitted HP for compatibility with older servers.

No creature identifier or template provenance enters room state or its event log. Editing/deleting a template still affects only future placements. Starting HP uses the existing token stats command field.

### Named attacks

Templates also store up to eight named attacks, each with a to-hit roll, a damage roll, or both. The existing attack editor is reused in the creature form. The shared schema bounds dice counts (1–20), die sides (4, 6, 8, 10, 12, 20, 100), modifiers (-99–99), and unique names (1–40 characters). Migration `0010_creature_attacks` adds JSONB defaulting to an empty array.

`token.create` accepts `attacks` (default empty), and nonempty lists are copied into optional `Token.attacks` by each TokenCreated event. Old tokens/events remain valid. Snapshots and create/delete events expose attacks only to the GM or token owners; ownership changes resync affected players to add/remove the field. Checkpoints and undo carry the copied values as part of the token.

The Attack panel reads browser edits first (including an explicitly empty list), then legacy saved attacks, then the token's copied attacks. Existing browser editing behavior is preserved. Save as creature reads the current browser values at opening time and copies them into the library; no template ID is recorded in the room.

## Consequences

- Wounded, defeated and negative-HP creatures can be prepared and reused.
- Templates created before this migration still start at full health.
- With null HP and null Max HP, placement keeps the existing Add Token defaults.
- The migration must be applied and the Prisma client regenerated before using the updated Postgres store.
- Explicitly untracked HP with a non-null Max HP is represented by the form's full-health default; it is not a separate template mode.
