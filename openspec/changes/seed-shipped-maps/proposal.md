## Why

A room that uses a shipped map records only its URL, never a library `assetId`. Saving an encounter from that room fails with "Put this room's map in your library first, then save the encounter", and the GM cannot follow that advice because the shipped maps are not library rows. The GM asked for every default map to live in their own library.

## What Changes

- Each account's library gains the three shipped maps (The Broken Span, Hollowfrost Keep, Temple of the Green Sun) as ordinary rows with their shipped size and measured grid. They are seeded once per account, on the first library list or encounter save after this ships. The GM may rename or delete them, and a deleted one is never seeded again.
- Deleting a seeded row removes only the database row. The shipped file under `apps/web/public/img` is never touched.
- A room that already uses a shipped map by URL, with no `assetId`, saves an encounter by resolving that URL to the owner's seeded row.
- The "Included with the app" section and the picker's built-in entries stop listing maps for signed-in accounts (they are rows now). Shipped token art stays as it is.
- The shipped map catalog moves to `packages/shared` so server and web read one definition.
- A nullable `gm_identities.shipped_maps_seeded_at` column records that an owner was seeded. See ADR 0036.

## Capabilities

### Modified Capabilities
- `builtin-library-assets`: shipped maps become seeded library rows; token art unchanged.
- `asset-library`: seeded maps are deletable rows; encounter save resolves a shipped map URL.

## Impact

`packages/shared` (new `shippedMaps.ts`), `apps/server` (store seed method, library route, `boardFromRoom`, Prisma migration 0014), `apps/web` (library page, picker). No change to `Command`, `DomainEvent` or `RoomState` schemas.
