# ADR 0036: Shipped maps seeded as library rows

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Changes:** `openspec/changes/seed-shipped-maps`
**Owner:** Real-Time Architecture (Raymond)

## Context

Shipped maps were a client-side catalog (`builtin:<slug>`), so a room using one recorded only a URL and could not link an encounter template to it (ADR 0024 needs a library map).

## Decision

Each account gets the shipped maps as real `library_assets` rows, once. `gm_identities.shipped_maps_seeded_at` (nullable timestamptz, migration 0014) records that an owner was seeded; deleting a row does not clear it, so a deleted map is not re-seeded. Seeding happens lazily and atomically in `LibraryStore.seedShippedMaps`, on the first library list by an account and on an encounter save that needs it. Rows use `objectKey = shipped:<slug>` and the shipped `/img/...` URL; library delete skips object deletion for that prefix. No `Command`, `DomainEvent` or `RoomState` schema changes; the catalog moves to `packages/shared/src/shippedMaps.ts`.

## Consequences

Existing rooms keep working: `boardFromRoom` resolves a shipped URL to the owner's row. Token art stays a client catalog. Re-measuring a shipped map does not update already-seeded rows.
