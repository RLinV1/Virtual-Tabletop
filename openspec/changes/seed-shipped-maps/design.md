## Decisions

- **Seed lazily, once per owner.** `LibraryStore.seedShippedMaps(ownerGmId, rows)` inserts the rows only if `shipped_maps_seeded_at` is null, and sets it, in one step (a transaction in Postgres), so concurrent calls seed once. Callers: `GET /api/library` for account owners, and `boardFromRoom` when a room's shipped map URL has no matching row. This covers new sign-ups and existing accounts with no signup hook or backfill migration.
- **Deleted stays deleted.** The flag, not the rows, records seeding; deleting a row does not clear it.
- **Row identity.** `objectKey` is `shipped:<slug>` and `url` is the shipped web path (`/img/...`). `DELETE /api/library/:id` skips `assets.delete` for keys with the `shipped:` prefix. `LocalDiskAssetStore.delete` uses `basename` inside the upload dir, so the shipped file was unreachable either way; the skip also avoids a pointless S3 call.
- **URL resolve.** `boardFromRoom` uses `map.assetId` when it resolves to the owner's map. Otherwise, if `map.url` is a shipped map URL, it uses the owner's map row with that URL (seeding first if needed). A GM who deleted that row gets the existing error.
- **Catalog in shared.** `SHIPPED_MAPS` (slug, name, url, size, grid) in `packages/shared/src/shippedMaps.ts`. Web `builtinAssets.ts` derives its map entries from it, so the signed-out landing shelf is unchanged.
- **Token art not seeded.** The request is about maps; token art stays a read-only built-in.
- **Device owners** are not seeded from the library list (they create nothing). Encounter save is account-only already.

## Risks

- Seeded rows have no detection row (`detectionStatus` null), so the grid-detection routes answer 404 for them, as for an upload with no analysis.
- A regenerated shipped image needs its catalog entry re-measured; already-seeded rows keep the old numbers.
