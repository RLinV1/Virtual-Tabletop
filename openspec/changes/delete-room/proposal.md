## Why

A GM can create rooms but can never get rid of one (KAN-72). The GM dashboard's "Your rooms" list only grows, test and abandoned rooms clutter it forever, and a GM who wants a room's content gone has no way to do it. There is no delete route, no store method and no UI.

## What Changes

- **Delete a room from the GM dashboard.** Each room in "Your rooms" gets a Delete action. A confirmation names the room and says that it and everything in it will be gone for good, with no undo. On confirm the room leaves the list.
- **`DELETE /api/rooms/:roomId`**, authorized by the GM identity (`X-GM-Token`, the `resolveGm` seam). Only the GM identity that owns the room can delete it. A missing or unknown token gets 401. A room that does not exist or is owned by someone else gets 404, so the endpoint cannot be used to probe room ids.
- **Everything scoped to the room is removed, and nothing else.** This covers the room row, its entire event log (and with it every token, map, scene, fog region, roll, chat message and participant), snapshots, checkpoints, guest credentials (revoked ones included), the invite code, `asset_refs` rows, images uploaded into that room through `/api/uploads`, the loaded `LiveRoom`, and the room's Redis seq counter.
- **Kept:** the GM's library assets, including ones placed in the deleted room. Only the usage link goes, so the library's delete warning stops naming the room. The GM's other rooms and the GM identity are untouched.
- **People in the room are told.** Every connected socket receives `sessionEnded { reason: "deleted" }` and is disconnected. The room page shows that the room was deleted by its GM instead of trying to reconnect. Later attempts with an old guest credential or invite link fail like any unknown room.
- **New per-room upload record.** `/api/uploads` records which room each uploaded image belongs to (`room_uploads`), so deletion knows which stored objects to remove. Uploads made before this change are not recorded and are not removed (see design).
- **BREAKING (contract):** `SessionEndReason` gains `"deleted"`, and `RoomStore` gains `deleteRoom` and a room-upload record. The append-only rule gets its first exception: a whole room's log may be erased when the room itself is deleted. New ADR 0009 records this.

## Capabilities

### New Capabilities
- `room-deletion`: the owning GM permanently deletes a room. Covers authorization, exactly what is removed and what is kept, disconnecting people who are in the room, and what old links and credentials do afterwards.

### Modified Capabilities
- `gm-dashboard`: the "GM dashboard" requirement's room list gains a Delete action with a confirmation, next to Open.

## Impact

- **packages/shared:** `SessionEndReason` adds `"deleted"`. New `DeleteRoom` response typing if needed. Schema change, so ADR 0009 plus review by the Real-Time Architecture owner.
- **apps/server:**
  - `RoomStore.deleteRoom(roomId)`, plus `recordRoomUpload` / room upload listing, in both the memory and the Postgres store.
  - Prisma: a `RoomUpload` model and migration `0003_room_uploads`.
  - `RoomRegistry.evict`, and `LiveRoom.close("deleted")`, which rejects further commands and ends every session.
  - The socket handshake refuses a closed room.
  - `RedisSeqSource.forget`.
  - The new route in `http/routes.ts`, with the upload route recording its room.
- **apps/web:** `api.gm.deleteRoom`, a Delete button and confirmation `Modal` in `GmDashboardPage`, and the `"deleted"` end reason in `RoomConnection` and the room page's ended screen.
- **docs:** `docs/adr/0009-room-deletion.md`. The docstrings on `RoomStore` and `schema.prisma` that say events are never deleted are updated to name the exception.
- **Tests:** memory and Postgres store tests, and a server integration test covering owner-only deletion, full cleanup, library assets surviving, and connected clients being ended.
