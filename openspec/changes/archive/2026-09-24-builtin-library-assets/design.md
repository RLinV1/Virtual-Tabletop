## Context

A library asset is a per-GM row on the server (ADR 0004). Placing one copies its URL, size and grid into room state and records `assetId`, so the server can keep a usage index and warn before a delete. The default images live in `apps/web/public/img/` and are served by the web origin at `/img/...`. `MapImage.url` and `Token.imageUrl` accept any origin-relative URL.

## Decisions

### Catalog lives in the web app, not the database
`apps/web/src/net/builtinAssets.ts` exports `BUILTIN_ASSETS: LibraryAsset[]` with stable ids prefixed `builtin:`, a fixed `createdAt`, the real pixel sizes, and `DEFAULT_GRID` for maps. It also exports `isBuiltin(asset)` and `libraryAssetId(asset)`, which returns `null` for a built-in and `asset.id` otherwise.

Why not seed rows? Rows would be per GM (N copies), deletable (so a GM could "lose" the defaults), and would need a migration plus a registration hook. The catalog changes only when the app ships new art, so it belongs with the art.

### Placing a built-in records no `assetId`
`GmPanel.place` and `AddToken` use `libraryAssetId(asset)`. A room using a built-in therefore never appears in any GM's usage index, and `SaveGridToLibrary` (shown only when `scene.map.assetId` is set) is not offered for it. The map still brings `DEFAULT_GRID` through the same `onSetMap(map, grid)` path as an upload.

### Picker and page ordering
The GM's own assets come first, most recent first as the server returns them, then the built-ins in catalog order. The library page shows built-ins as a separate list headed "Included with the app", using a read-only card: thumbnail, name and size, with no actions. Search filters both lists.

## Risks

- **A built-in file renamed or removed in a later release** leaves old rooms pointing at a missing URL. The board already draws a stand-in for a failed image (board-asset-fallback). Keep the file names stable.

## Verification

- Unit: the catalog has unique ids, every entry has the `builtin:` prefix, maps have a grid and tokens don't, and `libraryAssetId` returns null only for built-ins.
- Browser: a new GM with an empty library sees 3 maps and 5 tokens on the library page and in both pickers. Placing a built-in map sets the map and grid, with no "Save grid" offered. Adding a token with a built-in portrait draws the portrait.
- `npm run lint && npm run typecheck && npm test`.
