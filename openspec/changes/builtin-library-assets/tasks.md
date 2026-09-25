## 1. Catalog

- [x] 1.1 Add `apps/web/src/net/builtinAssets.ts` with the 3 maps and 5 portraits, `isBuiltin` and `libraryAssetId`; unit test ids, kinds, grids and `libraryAssetId`.

## 2. UI

- [x] 2.1 `LibraryPicker`: own assets, then built-ins; the empty message only for a search with no results.
- [x] 2.2 `GmPanel.place` and `AddToken` record `libraryAssetId(asset)` (null for built-ins).
- [x] 2.3 `LibraryPage`: read-only "Included with the app" list under the GM's own assets, filtered by tab and search.

## 3. Verification

- [x] 3.1 Browser: the library page and both pickers show the built-ins for a new GM; a built-in map sets map and grid with no "Save grid"; a built-in portrait draws on a new token.
- [x] 3.2 `npx openspec validate builtin-library-assets`, then `npm run lint && npm run typecheck && npm test`.
