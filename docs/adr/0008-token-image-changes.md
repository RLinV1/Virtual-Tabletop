# ADR 0008 — Changing a token's image

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0004-asset-library.md`
**Change:** `openspec/changes/token-image-edit`

## Context

A token's art can only be chosen when the token is created (`token.create`'s `imageUrl`/`assetId`). GMs want to change or remove it later from the token editor, by uploading a new image or picking one from their library, without deleting the token and losing its stats, conditions, owners and place in the turn order.

## Decision

- **Command:** `token.setImage { tokenId, imageUrl: string | null, assetId: Id | null = null }`. It's GM only, like choosing art at creation. Setting the image a token already has is rejected as `invalid`.
- **Event:** `TokenImageSet { tokenId, imageUrl, assetId, previous: { imageUrl, assetId } }`. It carries the art it replaced (invariant 6), so undo can restore it.
- **Visibility:** redacted for players when the token was hidden before the event, like the other per-token events.
- **Library "in use":** the server rebuilds its index from room state after every command (ADR 0004), so a changed or removed library image is tracked with no extra code.
- **Activity log:** "GM changed Goblin's image" / "GM removed Goblin's image".

## Consequences

- Additive: a new command and event, and no existing schema changes shape. Old logs replay unchanged.
- Clients built before this change fail on the new event (`assertNever`), as with every event addition. Deploy web and server together.

## Alternatives considered

- **Delete and recreate the token.** Rejected: it loses stats, conditions, owners, initiative position and history continuity.
- **A general `token.update` with optional fields.** Rejected: one event per field keeps `previous` exact and the activity log readable, matching the existing `token.set*` commands.
