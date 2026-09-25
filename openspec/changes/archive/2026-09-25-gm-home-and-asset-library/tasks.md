# Tasks

## 1. Contract and ADR (packages/shared)

- [x] 1.1 Write `docs/adr/0004-asset-library.md` covering D1, D4, D5 and D6 (GM device identity, `assetId`, `MapSet.grid`, the `asset_refs` projection) in the ADR 0003 format, and flag it for review by the Real-Time Architecture owner. Verify the file exists and links ADR 0001/0002.
- [x] 1.2 Add `assetId: Id.nullish()` to `MapImage` and `Token` in `state.ts`, and `assetId` (default null) to `token.create` in `commands.ts`. Verify with `npm run typecheck` and a test that parses an old-shape `MapImage`/`Token` without `assetId`.
- [x] 1.3 Add optional `grid` to `scene.setMap` and optional `gridChange: {grid, previous}` to `MapSet`. In `decide`, emit it with `previous = state.scene.grid` when `grid` is given, and apply both in `reducer.ts`. Verify with unit tests in `packages/shared/test/decide.test.ts`: map+grid is committed as one event, a compensating `MapSet` built from `previous`/`gridChange.previous` restores both, and `MapSet` without a grid behaves as before (spec: Place a library asset in a room).
- [x] 1.4 Copy `assetId` through `decide` for `token.create`. Verify with a unit test that the `TokenCreated` token carries it.
- [x] 1.5 Add the pure helper `referencedAssetIds(state)` including hidden tokens. Verify with unit tests covering the map, visible and hidden tokens, and a deleted token dropping out.
- [x] 1.6 Add zod schemas to `protocol.ts` for `GmIdentifyRequest`, `CreateRoomRequest.gmToken?`, `GmRoomSummary`, `LibraryAsset`, `LibraryUploadFields`, `LibraryPatchRequest` and `LibraryUsageResponse`. Verify with `npm run typecheck`.
- [x] 1.7 Extend `packages/shared/test/visibility.test.ts`: a hidden token with `assetId` is withheld from a player, and a visible one exposes `assetId` but no library name (spec: Library details stay private). Verify with `npm test`.

## 2. Persistence (apps/server/store)

- [x] 2.1 Add Prisma models `GmIdentity`, `LibraryAsset` and `AssetRef`, plus nullable `Room.ownerGmId` / `Room.name`, and generate an additive migration. Verify that `npx prisma migrate dev` applies cleanly on a fresh database.
- [x] 2.2 Add a `GmStore`/`LibraryStore` interface (identities, owned-room summaries with `max(events.created_at)`, asset CRUD, `setAssetRefs`, `usage(assetId, ownerGmId)`) with memory and Postgres implementations. Verify with tests in `apps/server/test/postgresStore.test.ts` and a memory-store equivalent.
- [x] 2.3 Add `AssetStore.delete(key)` for local disk and MinIO, and make `GET /uploads/:key` return 404 for a missing key on both. Verify with an integration test that deletes an object and gets 404 (spec: Missing images return not-found).

## 3. Server routes and pipeline (apps/server)

- [x] 3.1 Implement `http/gmAuth.ts` `resolveGm(req)` over the `X-GM-Token` header and `POST /api/gm/identify`. Verify with an integration test: an unknown or missing token gets 401, only a hash is stored, and identify is idempotent (spec: GM device identity).
- [x] 3.2 Accept `gmToken` on `POST /api/rooms` to set `ownerGmId` and `name`, and add `GET /api/gm/rooms`. Verify with an integration test: GM A sees only A's rooms, newest activity first (spec: GM dashboard).
- [x] 3.3 Move the multer/MIME/size filter into a shared helper and implement `http/library.ts`: upload, list, patch (name, grid), usage and delete. Every route calls `resolveGm` and returns 404 on an owner mismatch. Verify with integration tests for the upload/list/patch/delete happy paths, GIF and >25 MB rejection, the object key containing no name, and cross-GM 404s (spec: Library ownership and access, Upload to library).
- [x] 3.4 In `LiveRoom`, update `asset_refs` after each commit when `referencedAssetIds` changes, and resync once on room load. Verify with a multi-client test in `sync.test.ts`: placing a library token makes usage list the room, deleting the token clears it, and hidden tokens still count (spec: Warn before deleting an asset in use).
- [x] 3.5 Make the usage query count only rooms owned by the asset's owner. Verify with an integration test in which GM B references GM A's `assetId` and A's usage response does not list B's room.

## 4. Web: identity, routing, home (apps/web)

- [x] 4.1 Add `loadGmToken`/`ensureGmToken` to `net/identity.ts` (generate, store at `vtt.gm`, call `/api/gm/identify`), and add `api.gm.*` / `api.library.*` helpers that attach `X-GM-Token` to `net/api.ts`. Verify with `npm run typecheck` and by checking in the browser that the header is sent.
- [x] 4.2 Add the `library`, `signin` and `signup` routes to `router.ts` and `App.tsx`. Verify by checking that each path renders its page and unknown paths still reach not-found.
- [x] 4.3 Rewrite `HomePage.tsx` into a landing page (no GM token: pitch, create room, library, join by pasted link or code, sign in, create account) and a dashboard (GM token: My rooms with last-active and Open, create room, library link, account menu). Room creation sends `gmToken`. Verify manually against the gm-home scenarios in `npm run dev`. **Superseded by `home-page-redesign`:** the landing/dashboard split was replaced by one home page with a "Your rooms" band, verified manually on 2026-09-25.
- [x] 4.4 Build inert `SignInPage`/`SignUpPage` and the `AccountMenu`. Submitting shows the "accounts are coming, work is saved on this device" notice. Verify in the browser's network panel that submitting sends no request with the email or password (spec: Account UI placeholder).

## 5. Web: library page and room integration

- [x] 5.1 Build `pages/LibraryPage.tsx` with Maps/Tokens tabs, a thumbnail grid (name, size), case-insensitive search, upload (measures width/height in the browser), and rename. Verify manually against the Browse and Upload scenarios.
- [x] 5.2 Add a delete flow that calls usage first, names the rooms using the asset in the confirmation, and shows a plain confirmation when the asset is unused. Verify manually that nothing is deleted on cancel and the asset disappears on confirm.
- [x] 5.3 Add a `LibraryPicker` to `GmPanel.tsx`. "Set map" offers Upload new or From library, and a library map sends `scene.setMap {map+assetId, grid}`. "Add token" offers the same, and a library token sends `token.create {imageUrl, assetId}`. Verify by placing a map with cell size 64 and checking that the room grid is 64.
- [x] 5.4 Add "Save grid to library", shown only when `scene.map.assetId` is set, which PATCHes the grid. Verify that a corrected grid appears on the next placement and that the button is absent for a directly uploaded map.

## 6. Board fallback (apps/web/board)

- [x] 6.1 Render token images in `boardView.ts` as a sprite masked to the token circle. On load failure keep the colour disc, and remember failed URLs. Verify manually with a valid image and a 404 URL; ownership ring and condition markers must be unchanged (spec: Token images with fallback).
- [x] 6.2 Draw a neutral surface at the stored map size when the map image fails to load, with the grid on top. Verify by deleting a placed library map and checking that tokens keep their positions (spec: Map fallback).

## 7. Wrap-up

- [x] 7.1 Run the visibility-auditor and sync-reviewer agents on the diff and resolve their findings. Verify that no outstanding leak or invariant finding remains.
- [x] 7.2 End-to-end check: create a GM identity, upload a map and a token, create a room, place both, delete the token asset (the warning names the room), confirm, and see the colour disc in both the GM and player browsers. Verify by completing the flow in `npm run dev`.
- [x] 7.3 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
