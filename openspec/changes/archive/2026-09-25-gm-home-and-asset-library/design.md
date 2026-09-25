# Design

## Context

See proposal.md (Why) and the three spec deltas for the required behaviour. Current state relevant to the approach:

- Uploads go through `POST /api/uploads` (`apps/server/src/http/routes.ts`). That route authorizes with a **room** credential (`Authorization: Bearer <guestToken>`) and returns `/uploads/<uuid>.<ext>`. Nothing records the upload.
- `MapImage` is `{url, width, height}`, and `Token.imageUrl` exists in the contract. `board/boardView.ts` never draws token images, so every token is a colour disc today. `syncMap()` calls `Assets.load(url)` and ignores failures.
- `scene.setMap` → `MapSet {map, previous}` and `scene.setGrid` → `GridSet {grid, previous}` are separate events. There is no undo command yet. The `previous` fields exist so one can be built later (ADR 0001).
- Prisma has `Room` (no owner, no name), `Event`, `Credential`, `Snapshot` and `Checkpoint`. Every store has a memory twin used by tests (`memoryRoomStore.ts`).
- The `MinioAssetStore.read` path throws on a missing key, which currently surfaces as a 500 rather than a 404.

## Goals / Non-Goals

**Goals:**
- A single ownership seam, so FR-GM-01 later replaces one function and one header rather than every route.
- In-use detection that is exact and cheap: one indexed query, not a replay of every room.
- Keep the command pipeline unchanged: no I/O added to `decide`/`reduce`, and no new mutation path for `RoomState`.

**Non-Goals:**
- Server-side image decoding or thumbnail generation. The browser shows the original with `object-fit`.
- Verifying inside the command pipeline that an `assetId` belongs to the room's GM (see Risks).
- An undo command. This change only guarantees that the events carry what undo will need.

## Decisions

### D1. GM identity: `GmIdentity` table + `resolveGm(req)` + `X-GM-Token` header
The browser generates a 32-byte token with the same generator as `newGuestToken` and keeps it at `localStorage["vtt.gm"]`. The server stores `sha256(token)` in `gm_identities(id uuid, token_hash unique, created_at)`. `resolveGm(req): Promise<{gmId} | null>` in `apps/server/src/http/gmAuth.ts` reads the `X-GM-Token` header, hashes it and looks it up. `POST /api/gm/identify` registers a token idempotently, so the client can call it on first GM action.
- *Why a separate header, not `Authorization`:* `/api/uploads` already uses `Authorization` for the room credential. Two meanings for one header on neighbouring routes invites mix-ups. FR-GM-01 will replace the header with the `HttpOnly` session cookie from DESIGN.md §5.2 inside `resolveGm` only.
- *Alternative:* reuse the room GM credential. Rejected because the library must exist before any room does.

### D2. Rooms get an owner and a name
`Room` gains `ownerGmId uuid null` and `name text null`. `CreateRoomRequest` gains optional `gmToken`. When it is present and resolves, the room is owned by that GM. "Last active" is `max(events.created_at)` for the room, so no column is updated on every commit. `GET /api/gm/rooms` returns `{id, name, lastActiveAt}[]` for the caller only. Rooms created before this change have no owner and appear on no dashboard.

### D3. Library storage: `LibraryAsset` table, width/height reported by the client
`library_assets(id uuid, owner_gm_id, kind 'map'|'token', object_key, url, name, width, height, grid jsonb null, created_at)`. Search is filtered in the client, because a single GM's library is small. `GET /api/library?kind=` returns the whole list. Routes live in the new `apps/server/src/http/library.ts`: `POST /api/library` (multipart: file + zod-validated `kind/name/width/height`), `GET`, `PATCH /:id` (name, grid), `GET /:id/usage`, `DELETE /:id`. Every route calls `resolveGm` first, and a mismatched owner is a 404.
- *Why client-reported dimensions:* `GmPanel`'s `MapUpload` already measures images in the browser. Decoding on the server would add an image dependency for data that only affects the uploader's own board. The values are range-checked (positive ints ≤ 16384).
- Multer and the MIME/size filter are shared with `/api/uploads` by moving them into a small helper.

### D4. `assetId` on `MapImage` and `Token`, `.nullish()`
`MapImage.assetId` and `Token.assetId` are `Id.nullish()`. `token.create` gains `assetId` (default null), and `scene.setMap` already carries a `MapImage`. `decide` copies the id through. Old events, snapshots and states parse unchanged. Consumers treat `undefined` as "not from the library".
- *Why an id and not URL matching:* URLs are shared by every copy of an image and are fragile to compare. An id makes the usage query exact (spec: Warn before deleting). The id is a random UUID with no name in it, so sending it to players is acceptable (spec: Library details stay private).

### D5. `MapSet` optionally carries the grid
`scene.setMap` gains optional `grid: GridSpec`. When it is present, `decide` emits one `MapSet {map, previous, gridChange: {grid, previous}}`, and `reduce` applies both. One event means one log line and one step for a future undo, and the grid can never be left behind by a half-applied pair (invariant 6 holds: both previous values are carried). `GridSet` is unchanged. `visibility.ts` passes `MapSet` through as it does today. Placement is a **copy** (spec), so the room never reads back from the library.

### D6. In-use index: an `AssetRef` projection updated after commit
A pure helper in shared, `referencedAssetIds(state): Set<Id>`, collects `scene.map.assetId` and every token's `assetId`, hidden tokens included. After `LiveRoom.commit` has reduced a batch, it compares that set with the last one it wrote. If the set changed, it calls `store.setAssetRefs(roomId, ids)`, which replaces the room's rows in `asset_refs(asset_id, room_id, primary key both)`. The room also resyncs once when it is loaded, which repairs any drift left by a crash between append and projection.
- This is a read model derived from `RoomState`. It never feeds back into `RoomState`, so invariant 1 holds, and it does not touch `decide`/`reduce`.
- The usage query joins `asset_refs` → `rooms` with `rooms.owner_gm_id = asset.owner_gm_id`. References from rooms the GM does not own are ignored (see Risks).
- *Alternative:* replay each owned room on demand. Rejected because the cost grows with rooms × events, and it loads rooms into memory just to answer a dialog.

### D7. Delete is a hard delete, and history relies on the fallback
`DELETE /api/library/:id` removes the row, its `asset_refs` rows and the stored object (`AssetStore.delete(key)`, added for both disk and MinIO). The event log keeps the old URL forever (invariant 5). The board fallback (D8) is what keeps those rooms working. `GET /uploads/:key` maps a missing key (`NoSuchKey`/`ENOENT`) to 404.
- *Alternative:* soft delete and keep the object. Rejected because the user asked that references fall back once the asset no longer exists, and a kept object would still render.

### D8. Board fallback is client-side, in `board/`
- **Tokens:** `TokenView` gains a `Sprite` masked to the token circle. `Assets.load(imageUrl)` success sets the texture. On failure the sprite stays hidden and the existing colour disc shows. Failed URLs are remembered for the session so a missing image is not re-fetched on every sync.
- **Map:** `syncMap()` gets a `.catch` that sets `mapMissing = true`. `syncGrid()` already fills a neutral rect when there is no map, and that condition becomes `!map || mapMissing`, using the stored `width/height` from `boardSize()`. Board coordinates don't change, so tokens stay put (invariant 8).
- React components never touch Pixi. The panels only see state.

### D9. Account screens are inert
`/signin` and `/signup` are real routes with real forms, but they have no `action`. `onSubmit` calls `preventDefault()` and shows the "accounts are coming" notice. No field value leaves the page. The account menu reads only the local GM identity. When FR-GM-01 lands, these forms get wired to `/api/auth/*` and `resolveGm` switches to sessions. Assets are then claimed by re-pointing `library_assets.owner_gm_id` and `rooms.owner_gm_id` from the device identity to the user. That step is out of scope here, but the schema does not preclude it.

### D10. Web routing and data
`router.ts` adds `library`, `signin` and `signup` routes. `HomePage` branches on `loadGmToken()`. The dashboard and library fetch through new `api.gm.*` / `api.library.*` helpers that attach `X-GM-Token`. `GmPanel` gains a `LibraryPicker` dialog for maps and tokens. Picking a map sends `scene.setMap {map: {url,width,height,assetId}, grid}`. Picking a token sends `token.create {…, imageUrl, assetId}`. "Save grid to library" shows only when `state.scene.map.assetId` is set, and it calls `PATCH /api/library/:id {grid}`.

## Risks / Trade-offs

- **[A GM can put any `assetId`/URL in a command, including one that doesn't match or that belongs to another GM]** → The usage query counts only references from rooms owned by the asset's owner, so another GM cannot pin or probe your assets. A mismatched id/URL pair only misreports usage in the sender's own rooms. The pipeline is not given I/O to check ownership. If that ever matters, it would be a pre-decide lookup in `LiveRoom`, recorded in an ADR.
- **[Public-read bucket: a player who learns an image URL can load it]** → Accepted by the user. Keys are UUIDs, and hidden tokens (with their URL and `assetId`) are withheld by `filterStateForViewer`.
- **[Losing browser storage loses the GM identity, and with it the dashboard and library]** → This is the stated interim trade-off. The account menu and sign-in notice say work is saved on this device. FR-GM-01 is the fix.
- **[A crash between `store.append` and the projection write leaves `asset_refs` stale]** → The room resyncs on load. The worst case is a missing or extra warning, never data loss.
- **[Client-reported map size could be wrong]** → It only affects the uploader's own board. The values are range-checked.
- **[Schema change to shared contracts]** → ADR 0004 and review by the Real-Time Architecture owner before merge. All new fields are optional or nullish, so existing logs replay unchanged.

## Migration Plan

1. One Prisma migration adds `gm_identities`, `library_assets`, `asset_refs`, and the nullable `rooms.owner_gm_id` / `rooms.name`. It is additive only.
2. The memory store gets the same methods, so tests and the no-Docker dev mode work.
3. Deploy the server before the web client. An old client never sends `gmToken`/`assetId`, and the server accepts their absence.
4. Rollback: revert the code. The extra nullable columns and tables are harmless and can be dropped by a follow-up migration.

## Open Questions

- The exact copy for the "accounts are coming" notice, and whether the landing page gets illustration assets from `assets/ui-reference/`. This is a UI polish decision that can be made during implementation.
