# Tasks

## 1. Contract and ADR

- [x] 1.1 Write `docs/adr/0009-room-deletion.md`: the narrow exception to invariant 5 (D6), the `"deleted"` end reason (D5), `room_uploads` (D4), and the multi-instance caveat. Update the `RoomStore` docstring and the `schema.prisma` header comment to name the exception. Verify the ADR links ADR 0001 and ADR 0006, and mark it Proposed until the Real-Time Architecture owner reviews it. Numbered 0009: main took 0007 (shared area templates) and 0008 while this change was in flight.
- [x] 1.2 Add `"deleted"` to `SessionEndReason` in `packages/shared/src/protocol.ts` and export any `DELETE /api/rooms/:roomId` response type. Verify with `npm run typecheck` that every `switch` on the reason still compiles and handles the new case.

## 2. Storage (apps/server)

- [x] 2.1 Add the `RoomUpload` model (`room_id` FK and `object_key`, primary key on both, index on `room_id`) to `schema.prisma` and create migration `0003_room_uploads`. Verify `npx prisma migrate dev` applies cleanly on a fresh database and on one migrated to `0002`.
- [x] 2.2 Add `findRoomOwner(roomId)`, `recordRoomUpload(roomId, key)` and `deleteRoom(roomId): Promise<{ uploadKeys: string[] } | null>` to `RoomStore`, and implement them in `MemoryRoomStore`. `deleteRoom` drops the room's events, invite, credentials, room row, asset refs and uploads. Verify with store unit tests: after `deleteRoom`, `roomExists`, `findRoomByInvite`, `findCredential` (including revoked credentials), `loadEvents`, `listOwnedRooms` and `assetUsage` show no trace of the room, while another room and the library asset are intact.
- [x] 2.3 Implement the same methods in `PostgresRoomStore`: one `$transaction` that deletes children first (D3) and returns the upload keys. Verify by running the 2.2 tests against Postgres in `postgresStore.test.ts`, plus a test in which a forced failure mid-transaction leaves every row in place.
- [x] 2.4 Add `RedisSeqSource.forget(roomId)` (DEL `room:<id>:seq`) and expose it through the Postgres store's delete path. Verify with a unit test using a fake or real Redis that the key is gone after delete.

## 3. Live room and transport (apps/server)

- [x] 3.1 Add `LiveRoom.close(reason)`. It runs through the room's queue, sets `closed`, makes `submit`, `join` and `relayEphemeral` refuse, and sends `sessionEnded` to every client and disconnects them. Verify with a unit test that a command queued behind the close is not appended.
- [x] 3.2 Add `RoomRegistry.close(roomId, reason)` and `evict(roomId)`, and make the socket handshake answer `not_found` for a closed room. Verify with an integration test that a handshake between close and evict is refused and does not re-register the room.
- [x] 3.3 Record uploads: `/api/uploads` calls `store.recordRoomUpload(actor's roomId, key)` after `assets.put`. Verify with an integration test that an upload by a room's GM creates the record.

## 4. Delete endpoint (apps/server)

- [x] 4.1 Add `DELETE /api/rooms/:roomId` in `http/routes.ts`: `resolveGm` (401 when missing), check the owner (404 when there is no room or the owner is someone else), then close, `deleteRoom`, evict, and best-effort deletion of the upload objects and the Redis key (D2). Respond 204. Verify with integration tests in `apps/server/test/roomDeletion.test.ts` (`describe("room deletion (KAN-72, FR-GM-15)")`):
  - the owner gets 204;
  - another GM gets 404;
  - no token, or a guest bearer credential, gets 401;
  - a second delete gets 404.
- [x] 4.2 Integration test for full cleanup. Create a room, join a player, place a library map and an uploaded token image, then delete the room. Verify: the history endpoint no longer serves the room; `GET /uploads/<key>` returns 404; the invite join returns 404; the library asset still exists and `/usage` no longer names the room; the GM's other room is untouched.
- [x] 4.3 Integration test for connected clients. The GM and a player are connected when the owner deletes the room. Verify both receive `sessionEnded { reason: "deleted" }`, both sockets are disconnected, and a reconnect with the old credential fails with `unauthorized`.

## 5. Web (apps/web)

- [x] 5.1 Add `api.gm.deleteRoom(gmToken, roomId)` in `net/api.ts`, treating 204 and 404 as success. Verify with `npm run typecheck`.
- [x] 5.2 In `GmDashboardPage`, add a Delete button to each room row that opens the confirmation `Modal` (room name, permanence warning, Cancel focused by default). Remove the row on success and show an inline error on failure. Verify manually in `npm run dev`: cancel sends no request; confirm removes the row; deleting the last room shows the empty state.
- [x] 5.3 Handle `endReason: "deleted"` in `RoomConnection` and the room page's ended screen ("This room was deleted by its GM", with a link home), and widen the `unauthorized` copy to mention that the room may have been deleted. Verify manually with two browsers: delete from the dashboard while a player is in the room, and the player sees the deleted screen with no reconnect loop.

## 6. Close-out

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass.
- [ ] 6.2 Run the `sync-reviewer` and `visibility-auditor` agents on the diff and verify neither reports a violation.
