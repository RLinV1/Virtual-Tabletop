# ADR 0020: Creature colour, starting conditions and adding several tokens

**Status:** Proposed — needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0012-library-creatures.md`
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-70-creature-templates` · **Ticket:** KAN-70

## Context

Library creatures (ADR 0012) save a name, size, Max HP, AC and art, and Add Token copies them into an ordinary `token.create`. KAN-70 asks for the rest of a reusable monster: its disc colour, the conditions it starts with, placing several at once, and saving a token already on the board as a creature. ADR 0012 deliberately kept the room ignorant of creatures; that stays.

## Decision

### Creatures gain `color` and `conditions`

`CreatureFields` adds `color` (the token colour rule, six-digit hex) and `conditions` (up to 12 condition ids, no duplicates). `CreateCreatureRequest` defaults them to the standard token colour and none. Postgres adds `library_creatures.color` (nullable text) and `conditions` (text array, default empty) in migration `0008_creature_color_conditions`. A null colour, on rows from before this change, reads as the default; unknown condition strings are dropped when read. No backfill.

### `token.create` gains `conditions` and `count`

- `conditions: ConditionId[]` (max 12, default `[]`): the token starts with them. `decide` rejects duplicates as `invalid`. Previously a new token always started with none and a second command set them.
- `count: 1..20` (default 1): `decide` emits that many `TokenCreated` events in the one command, so they commit as one batch with one `commandId` (ADR 0013). Positions come from a pure `spreadPositions` in `geometry.ts`: the first on the chosen point, the rest on the nearest free spots ring by ring outward (row by row within a ring), one footprint apart, whose whole footprint is on the map and overlaps no other token of any size; if the map runs out of room the rest share the chosen point. Names follow the existing numbering rule (KAN-62), each copy counted against the room and the copies before it: "Goblin", "Goblin 2", "Goblin 3".

Both fields have defaults, so every existing client, stored command shape and event still parses. `TokenCreated` already carries the whole token, conditions included, so no event changes and visibility is unchanged: hidden copies are redacted for players like any hidden token.

### Save as creature is client-only

The GM token editor prefills the existing creature form from the token. The image comes along only when the token's asset is one of the GM's own library token art; the server's creature validation remains the real check. No room command or event is involved.

## Consequences

- A creature still never reaches the room: nothing about which creature a token came from is recorded or sent to players (ADR 0012).
- Twenty tokens in one command is one `append` of twenty rows, one transaction.
- When the map is full, copies pile on the chosen square; visible, and fixable by dragging.
- Placement searches at most 20 rings (1,680 perimeter candidates), independent of map dimensions and token size. After that budget is exhausted, remaining copies share the chosen square. This bounds synchronous server work for tiny footprints and off-map origins.

## Alternatives considered

- **A separate `token_templates` table** as the ticket text suggests. It would duplicate creatures field for field and leave two near-identical library sections.
- **The client sends N `token.create` commands.** Not atomic, N round trips, N separate activity-log lines and undo entries.
