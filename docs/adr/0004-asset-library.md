# ADR 0004 — GM device identity and the asset library

**Status:** Proposed — needs review by the Real-Time Architecture owner (Raymond) · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0002-transport-and-identity.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/gm-home-and-asset-library`

## Context

GMs need to store map and token art before a room exists and reuse it across rooms. They also need to find their rooms again. Until now, every upload was authorized by a room credential and recorded nowhere. GM accounts (FR-GM-01, DESIGN.md §5.2) are not built yet, but the library needs an owner that is not a room participant. It also changes `MapImage`, `Token`, `scene.setMap` and `MapSet`, which are existing contracts in `packages/shared`.

## Decisions

### An interim GM identity behind one seam

The browser generates a 32-byte GM token (the same generator as guest tokens, DESIGN.md §5.1) and keeps it in `localStorage`. The server stores only its SHA-256 in `gm_identities`. Rooms (`rooms.owner_gm_id`) and library assets are owned by that identity.

Every server check goes through `resolveGm(req)`. Its argument is the `X-GM-Token` header, kept separate from `Authorization`, which `/api/uploads` already uses for the room credential. FR-GM-01 will replace the header with the session cookie inside that one function. Device-owned rows are then claimed by re-pointing `owner_gm_id`.

This is not a participant, and the room kernel never sees it. Game logic still refers only to `participants.id` (DESIGN.md §4.2).

### `assetId` on `MapImage` and `Token`

Both gain `assetId: Id.nullish()`, and `token.create` accepts it. It is an opaque UUID with no name in it, so a player receiving it learns nothing, and no player-reachable endpoint resolves it. It is **nullish**, not required, so every event and snapshot already in the log parses and replays unchanged.

The URL is still what the board loads. The id exists so "which rooms use this asset" is an exact match rather than a URL comparison.

### `MapSet` can carry the grid

`scene.setMap` gains an optional `grid`. When it is present, `decide` emits a single `MapSet {map, previous, gridChange: {grid, previous}}`, and `reduce` applies both. Placing a library map is one fact in the log. A future undo is one compensating event, and a map can never be left with the wrong grid by a half-applied pair. Both replaced values are carried (CLAUDE.md invariant 6). `GridSet` is unchanged.

Placing a map **copies** the grid. The room never reads from the library again, so editing a library entry cannot change a room.

### The asset-reference index is a projection, not state

`asset_refs(asset_id, room_id)` answers the delete warning. After each commit, `LiveRoom` computes `referencedAssetIds(state)` (pure, in shared; hidden tokens included) and replaces the room's rows when the set changed. It resyncs once when the room is loaded, to heal any drift from a crash between append and projection.

It is a read model derived from `RoomState`. Nothing reads it back into `RoomState`, and `decide`/`reduce` are untouched (invariants 1 and 2). The usage query counts only rooms owned by the asset's owner, so another GM who pastes your `assetId` into a command cannot pin or probe your assets.

### Delete is final, and history falls back

Deleting an asset removes its row, its refs and its stored object. The event log keeps the old URL forever (invariant 5). The board draws a generic stand-in when an image returns 404: a token becomes its colour disc, and a map becomes a neutral surface at the stored `width`×`height`. Board coordinates never depend on the image, so nothing moves.

## Consequences

- `MapImage` and `Token` consumers must treat a missing `assetId` as "not from the library".
- `MapSet` consumers that care about the grid must read `event.gridChange` as well as `GridSet`. The grid and its replaced value travel as one object, so the schema cannot express a grid change without the value it replaced.
- The delete warning is checked and then acted on, not locked: a room can start using an asset between the warning and the delete. The 404 stand-in makes that harmless. `asset_refs` only ever records ids that still have a library row, so a room still showing a deleted asset cannot write it back.
- A library asset's name never becomes a token's name automatically. The GM types the token name, because anything in a visible token's name reaches players.
- The command pipeline does not check that an `assetId` belongs to the room's GM. A mismatched id only misreports usage in the sender's own rooms. If that changes, the check belongs in a pre-decide lookup in `LiveRoom`, recorded in a new ADR.
- Losing browser storage loses the GM identity. That is the accepted interim cost until FR-GM-01.
