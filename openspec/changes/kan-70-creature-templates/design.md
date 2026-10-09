## Context

Library creatures (ADR 0012) live in `library_creatures`, are served from GM-only `/api/library/creatures` routes, and are validated by `CreatureFields`, which is built from `Token.shape` so a creature always makes a valid `token.create`. Placement copies values into the Add Token form, which then sends an ordinary `token.create`. The room never learns a creature id. `decide` gives each created token a unique name through `uniqueTokenName` (KAN-62). `token.create` has no `conditions` field: conditions are set later with `token.setConditions`.

## Goals / Non-Goals

**Goals:**
- Creatures round-trip everything a token's look and starting state needs.
- Several copies in one atomic, numbered action.
- Saving from the board reuses the library API with no room-side change.

**Non-Goals:**
- Rolled HP (e.g. 2d6+2) per copy. Starting HP and named attacks are covered by the 2026-10-05 completion (ADR 0023).
- Linking placed tokens back to their creature.
- Saving a whole encounter (KAN-50).

## Decisions

### 1. Extend `CreatureFields`, not a new template type
Add `color: Token.shape.color` and `conditions: Token.shape.conditions` to `CreatureFields`, with defaults in `CreateCreatureRequest`. Columns: `color TEXT NULL` and `conditions TEXT[] NOT NULL DEFAULT '{}'`. A null colour reads as `DEFAULT_TOKEN_COLOR`, so old rows need no backfill.

*Alternative:* a separate `token_templates` table as the ticket text suggests. Rejected: it would duplicate creatures almost field for field, and leave the GM two near-identical library sections.

### 2. `count` and `conditions` on `token.create`
`conditions: z.array(ConditionId).max(12).default([])` and `count: z.number().int().min(1).max(20).default(1)`. `decide` emits `count` `TokenCreated` events with ids from `ctx.newId`. They are committed as one batch (one `commandId`), so they are atomic and grouped in the activity log. Both fields have defaults, so every existing client and stored command shape stays valid. `TokenCreated` already carries the whole `Token`, including `conditions`, so no event change is needed.

*Alternative:* the client sends N `token.create` commands. Rejected: they are not atomic, and N round trips mean N separate log lines.

### 3. Placing copies on free squares
A pure helper, `spreadPositions(origin, size, count, grid, map, occupied)`, walks outward ring by ring (Chebyshev distance 0, 1, 2, …) from the clicked square in a fixed order (row-major within each ring). It takes squares whose footprint holds no other token centre and lies on the map, until it has `count`. If the map runs out of room, it reuses the origin. `decide` calls it, which keeps it deterministic. Names: call `uniqueTokenName` against a state that already includes the earlier copies, so they number "Goblin", "Goblin 2", … in order.

### 4. Save as creature is client-only
The token editor (GM only) opens the existing creature form prefilled from the token. The image is included only when `token.assetId` is one of the GM's own token-art assets, checked against the library list the client already loads. The server's existing creature validation is the real check. No room command or event is involved.

## Risks / Trade-offs

- [Schema change to `token.create` and `CreatureFields`] → Additive with defaults. Needs an ADR amending ADR 0012 and owner review.
- [20 tokens in one batch on a slow store] → A single `append` of 20 rows is still one transaction. The cap bounds it.
- [Copies pile on the origin when the map is full] → Rare, visible, and fixable by dragging. That beats failing the whole action.
- [Hidden copies and grouping] → Players already get redacted seqs for hidden `TokenCreated`, and `commandId` is stripped for players (ADR 0013). Nothing new leaks.
