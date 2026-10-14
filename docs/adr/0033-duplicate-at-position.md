# ADR 0033 — Duplicate at a chosen square

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Amends:** `docs/adr/0026-token-groups-and-duplicate.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/token-placement-flow` · **Ticket:** KAN-82

## Context

`token.duplicate { tokenId, count }` copies a token on the server and spreads the copies on the free squares beside the original (ADR 0026). The GM can't choose where they go. `token-placement-flow` makes every way of adding tokens (New Token, Saved Creatures, Duplicate) a placing mode that repeats until the GM finishes: one click, one token. Duplicate therefore needs to name the square, while the copy itself stays server-side. That keeps it exact (the server's copy of the original, hidden fields included), and keeps "copies join the original's group in the same action" atomic. Building a `token.create` on the client instead would need a second `group.assign` with an id the client doesn't learn from the create.

## Decision

- **Command:** `token.duplicate` gains `position: Point` (optional, board coordinates, invariant 8). The schema stays `.strict()`, and `count` stays (1–20, default 1).
- **With `position`:** `decide` refuses a footprint that crosses a wall at `position`, as `token.create` does, then creates the copies starting at `position` with the same spread as `token.create` (no `besideOrigin`). When the original is grouped, it emits the same `TokensGrouped` event in the same decision.
- **Without `position`:** unchanged from ADR 0026.
- **Events:** the existing `TokenCreated` and `TokensGrouped` only. No new event, state field or visibility rule. Undo, replay, the activity log and both filters are untouched.
- **Client:** the web app sends `{ tokenId, position }` once per placement click and never sends `count`. `token.create`'s `count` is likewise kept in the schema but no longer offered in the UI.

## Consequences

- Additive and backwards-compatible for old clients.
- The schema is `.strict()`, so an old server rejects a command carrying `position`. Deploy the server before, or with, the web app.
