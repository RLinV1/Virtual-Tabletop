## Why

A new GM opens the asset library to an empty page and has to find and upload images before they can try anything. The app already ships three battle maps and five character portraits for the home page (`apps/web/public/img/`). They look like what the library is for, but the library can't reach them. Every GM should be able to use them straight away, without uploading them first.

## What Changes

- **A built-in catalog.** The 3 maps (The Broken Span, Hollowfrost Keep, Temple of the Green Sun; 1672×941, default 70 px grid) and 5 token portraits (192×192) that already ship with the web app become a fixed, read-only catalog.
- **Library page.** Under the GM's own assets, an "Included with the app" section lists the built-ins for the current tab (Maps or Tokens) and search. The cards have no Rename or Delete.
- **Pickers in the room.** "From library" for maps and token images shows the GM's own assets first, then the built-ins. The picker is never empty, so the "Nothing here yet" message now only appears when a search matches nothing.
- **Placing a built-in** works like placing an upload. A map brings its saved grid and a token uses the portrait. The room records the image URL with `assetId: null`, because a built-in isn't a row in anyone's library. So "Save grid to library" is not offered for a built-in map, and the usage index and delete warnings are unaffected.
- Every GM sees the same built-ins, and nothing is copied per GM. Built-ins can't be renamed or deleted, so one GM can never remove one for everyone.

## Capabilities

### New Capabilities
- `builtin-library-assets`: a read-only catalog of maps and token art included with the app, available in every GM's library and pickers.

### Modified Capabilities
None. `asset-library` is still in an unarchived change, so this is additive.

## Impact

Web only: a new `apps/web/src/net/builtinAssets.ts` catalog, and changes to `pages/LibraryPage.tsx`, `pages/LibraryPicker.tsx`, `pages/GmPanel.tsx` and `panels/AddToken.tsx`. There are no server, database or `packages/shared` schema changes. `LibraryAsset` is reused as the in-memory type, but built-ins never cross the wire as library rows. Rooms store only a map or image URL (already allowed by `MapImage.url` and `Token.imageUrl`), so invariants 1–8 hold. The images are already served from the web origin under `/img/`.

## Non-goals

- Seeding per-GM copies into the database. It would duplicate rows, and deleting a copy would look like deleting the default.
- Letting GMs hide built-ins, or a server-side catalog that admins can edit.
- Moving the home page to the shared catalog. It keeps its own marketing copy and alt text, but uses the same files.
