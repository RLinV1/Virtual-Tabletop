# ADR 0009: Room deletion

**Status:** Proposed. Awaiting review by the Real-Time Architecture owner (Raymond). **Amends:** `docs/adr/0001-event-model.md` (append-only), `docs/adr/0006-participant-lifecycle.md` (session end reasons)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/delete-room` (KAN-72)

## Context

A GM can create rooms but never remove one. The dashboard's room list only grows, and a GM who wants a room's content gone has no way to get rid of it. A room's data is spread across several places:
- **Postgres:** the room row, which holds the invite code; its event log; snapshots and checkpoints; guest credentials; and the `asset_refs` projection.
- **Server memory:** the `LiveRoom` held in `RoomRegistry`.
- **Redis:** the room's seq counter.
- **Object storage:** images uploaded from inside the room through `/api/uploads`.

The server does not currently record which room an upload came from.

ADR 0001 says events are append-only and are never updated or deleted (invariant 5). Deleting a room has to erase its log, so this ADR records where that rule stops.

## Decision

### The exception to append-only

Invariant 5 holds for every room that exists. **Deleting a room erases its whole log as one unit, and it is the only operation allowed to remove events.** Nothing trims, rewrites or partially deletes a live room's log. Undo is still a compensating event. The `RoomStore` contract and the `schema.prisma` header say this.

### Who may delete

Only the GM identity that owns the room (ADR 0004 `rooms.owner_gm_id`, resolved by `resolveGm`) may delete it, through `DELETE /api/rooms/:roomId`.
- With no identity, or one the server doesn't recognise, the request gets **401**.
- For a room that doesn't exist, or that belongs to someone else, it gets **404**, so the endpoint can't be used to learn which room ids exist.
- A guest credential, including the room's in-room GM seat, can't delete.
- A room with no owner can't be deleted.

### Order of operations

1. **Close the live room.** `LiveRoom.close("deleted")` runs through the room's command queue, so a command already running finishes and anything queued after it is refused. The room is marked closed, and from then on:
   - commands, joins and ephemeral messages are refused;
   - every connected client gets `sessionEnded { reason: "deleted" }` and is disconnected;
   - the socket handshake answers `not_found` for a closed room.
2. **Delete the stored data in one transaction.** Children are removed first: `asset_refs`, `credentials`, `checkpoints`, `snapshots`, `events` and `room_uploads`, then the room row. It commits entirely or not at all. There is deliberately no `ON DELETE CASCADE`, so no future `room.delete` can quietly widen what gets removed.
3. **Evict the room from the registry.** If step 2 failed, the closed room is evicted anyway, so the next access reloads it from storage.
4. **Clean up, best-effort, after the commit:** delete the recorded upload objects and the Redis seq key. Failures are logged. The objects left behind have random names and nothing references them.

### Recording uploads per room

A new `room_uploads(room_id, object_key)` table is written by `/api/uploads`, which already authenticates the room's GM. Deletion removes exactly those objects. It never touches library objects (`library_assets`) or built-in art.

We did not scan the event log for upload URLs instead, because a command may name any origin-relative URL: the same object could appear in another room, and deleting it would break that room. Uploads made before this ADR aren't recorded, so they stay in storage as unreferenced objects.

### Protocol

`SessionEndReason` gains `"deleted"`. The client treats it like `left` and `revoked`: it ends the session and does not reconnect. Later handshakes with an old credential fail with `unauthorized`, because the credential row is gone. No tombstone is kept, since a tombstone would be room data left behind.

## Consequences

- Deleting a room is permanent. There is no soft delete and no restore.
- Library assets survive the deletion of any room that used them. Only the usage link in `asset_refs` goes.
- Multiple instances: the registry is single-process (ADR 0001). A peer instance still holding a `LiveRoom` for a deleted room fails its next append on the foreign key, because the room row is gone. No data comes back.
- Orphaned objects are possible: legacy uploads, and failed best-effort deletes. A later sweep can compare storage against `room_uploads` and `library_assets`.
