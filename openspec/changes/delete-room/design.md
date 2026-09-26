## Context

See proposal.md for motivation (KAN-72). What the code does today:

- **Postgres rows.** A room's data lives in `rooms` plus the child tables `events`, `credentials`, `snapshots`, `checkpoints` and `asset_refs`. All have plain FKs to `rooms.id` and no `ON DELETE CASCADE`. The invite code is a column on `rooms`. The memory store keeps the same data in maps: `events`, `invites`, `credentials`, `rooms` and `refs`.
- **Live state.** `RoomRegistry` caches one `LiveRoom` per room id, forever. A `LiveRoom` holds the connected clients and already knows how to end a session: `endSession` sends `sessionEnded` and then closes the socket (ADR 0006).
- **Redis.** `RedisSeqSource` keeps `room:<id>:seq` when Redis is configured.
- **Uploads.** `/api/uploads` is authorized by a room GM's guest credential, so the server knows the room at upload time, but it does not record it. The object key is a random filename. Library uploads are separate rows in `library_assets`.
- **GM identity.** `resolveGm` turns `X-GM-Token` into a `gmId`. `rooms.owner_gm_id` records the owner. The dashboard (`GmDashboardPage`) is the only place that lists owned rooms.
- **The invariant.** `RoomStore` and `schema.prisma` both state that events are never deleted (invariant 5).

## Goals / Non-Goals

**Goals:**
- One server operation that removes a room completely and cannot leave half a room behind.
- No window in which a deleted room accepts commands, or a reconnecting socket brings it back into the registry.
- A clean record in an ADR of why erasing a room's log does not break invariant 5 for rooms that still exist.

**Non-Goals:**
- Soft delete, a trash bin, or restore. Deletion is permanent, as KAN-72 asks.
- Deleting a room from inside the room. The room's in-room GM seat is a guest credential, not the owning identity.
- Deleting rooms that have no owner (created before ADR 0004). They are not listed anywhere a GM could delete them from.
- Finding and deleting images uploaded before this change (see D4).
- Bulk delete, or deleting a GM identity.

## Decisions

**D1. The endpoint is `DELETE /api/rooms/:roomId`, authorized by GM identity, with 404 for rooms the caller doesn't own.** It uses `resolveGm` (401 when there is no identity), then `store.findRoomOwner(roomId)`. When the owner doesn't match `gmId`, the route answers 404. That mirrors how `findAsset` hides other GMs' rows, and it stops the endpoint from confirming that a room id exists. KAN-72's text says 403. We chose 404 so there is no existence oracle.
*Alternative:* authorize with the room GM's guest credential, like `/invite`. Rejected: the dashboard has no guest credential for every room, and ownership belongs to the GM identity.

**D2. The order is: close the live room, then delete the stored rows, then evict, then clean up best-effort.** `RoomService.deleteRoom(roomId)` (or a function in `routes.ts` using `registry` and `store`) runs these steps:
1. `registry.close(roomId, "deleted")`. If the room is loaded, `LiveRoom.close` sets `closed`. `submit`, `join` and `relayEphemeral` refuse from then on. Every client gets `sessionEnded { reason: "deleted" }` and is disconnected. The handshake checks `room.closed` and answers `not_found`. Closing goes through the room's existing command queue, so a command already running finishes, and anything queued behind it is refused.
2. `store.deleteRoom(roomId)`: one transaction (D3).
3. `registry.evict(roomId)`. Any later `get` reads `roomExists` as false and returns null.
4. Best-effort, after the commit: delete each recorded upload through `AssetStore.delete`, and `seqSource.forget(roomId)`. Failures are logged, not returned. The room is already gone, and a stray object is harmless because its name is a random key.

*Why close first:* if we deleted first, a command in flight would hit an FK violation and the client would see "Internal error". A handshake between the delete and the eviction would also find a stale `LiveRoom` in the registry. If step 2 fails, the route returns 500. The room stays in the store, and the registry evicts the closed `LiveRoom` so the next `get` loads it fresh, so a failed delete does not leave the room unusable.

**D3. Postgres deletes explicitly, children first, in one `$transaction`.** The order is `asset_refs`, `credentials`, `checkpoints`, `snapshots`, `events`, then `room_uploads` is read (keys returned to the caller) and deleted, and finally `rooms`. `deleteRoom` returns the upload keys so the caller can remove the objects after the commit. The memory store mirrors this, dropping every map entry for the room.
*Alternative:* `onDelete: Cascade` on every relation in a migration. Rejected: it quietly widens what any future `room.delete` does, and it changes the FK behaviour of existing tables for this one path. Explicit deletes keep the list reviewable and easy to test.

**D4. A new `room_uploads(room_id, object_key)` table records per-room uploads.** `/api/uploads` already authenticates the room's GM, so after `assets.put` it calls `store.recordRoomUpload(roomId, key)`. Deletion removes exactly those objects. It never touches `library_assets` objects or built-in `/img/` art.
*Alternative:* scan the room's event log for `/uploads/` URLs that are not library objects. Rejected: an upload URL could appear in another room's log, because a command may name any origin-relative URL, and deleting it would break that room. It also means guessing ownership from content. The cost of the table: images uploaded before this change stay in storage. They are unreferenced, randomly named and harmless, and a later cleanup job can collect orphans.

**D5. `SessionEndReason` gains `"deleted"`, and the client treats it as terminal.** This reuses ADR 0006's path. The `sessionEnded` message stops reconnection, and `RoomConnection` sets `status: "ended"` with `endReason: "deleted"`. The room page's ended screen says "This room was deleted by its GM" and links home. Old credentials afterwards fail the handshake with `unauthorized`, because the credential row is gone. The client already treats that as terminal, and its copy is widened to mention that the room may have been deleted.
*Alternative:* keep a tombstone row so later handshakes can say `deleted`. Rejected: it leaves room data behind, which is what KAN-72 asks us not to do.

**D6. ADR 0009 makes a narrow exception to invariant 5.** Events stay append-only for any room that exists. Deleting a room erases its log as a unit, and that is the only operation allowed to remove events. Nothing rewrites or trims part of a log. The `RoomStore` docstring and the `schema.prisma` header comment are updated to say this. The ADR is reviewed by the Real-Time Architecture owner, as CLAUDE.md requires for shared schema changes.

**D7. Dashboard UI.** Each row gets a `secondary small danger` Delete button next to Open. It opens the existing native-`<dialog>` `Modal` with the room's name, the permanence warning, Cancel (focused by default) and Delete. On success the row is removed from local state and the list is not refetched. On failure the modal closes and an inline error appears on the card. There is no optimistic removal.

## Risks / Trade-offs

- [Irreversible: a mis-click destroys a campaign] → A confirmation that names the room, with Cancel focused by default. No soft delete was requested. Revisit when accounts land.
- [Multi-instance deployments: another server instance may hold a `LiveRoom` for the room] → The registry is already single-process only (ADR 0001). A peer's in-flight append fails on the FK because the room row is gone, so no data is resurrected. Documented in ADR 0009.
- [Orphaned objects from uploads made before the change, or from failed best-effort deletes] → Harmless random keys. Follow-up: an orphan sweep that compares storage against `room_uploads` and `library_assets`.
- [A 404 for "not yours" hides real permission errors from a confused GM] → The dashboard only offers Delete on rooms it just listed as owned, so a 404 there means the room is already gone. The UI treats that as success and removes the row.
- [Contract change to `SessionEndReason`] → Additive union member. Older clients fall into their generic ended handling. ADR 0009 and owner review.

## Migration Plan

1. Prisma migration `0003_room_uploads` adds the table (with an FK to `rooms` and an index on `room_id`). It is additive, and existing rows are unaffected.
2. Deploy the server before the web app. The web app's Delete button needs the route, and the new end reason is additive.
3. Rollback: revert the code. The `room_uploads` table can stay because nothing reads it once the code is reverted.
