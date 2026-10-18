# Design

## Shared import pipeline

Both entry points call `receiveUvtt`, using the same multipart bounds, strict file validator and single bounded worker pool. Library import authorizes a signed-in account, checks same-origin protection and limits attempts before receiving a body. It rechecks session liveness after worker completion. Rooms retain active GM, room credential, preparation quota and baseline checks. Library imports inherit default units/style; room imports inherit room units/style.

`createUvttLibraryMap` writes a validated image under a random key and inserts one complete existing library asset record with grid and board. A failed insert removes the image. Postgres library inserts and grid/board edits use the event store's parameterized JSON text/JSONB strategy to preserve numeric precision; a real-database regression first reproduced Prisma JSON-input rounding of portal rotations and coordinates. It never enqueues image grid detection because UVTT supplies the grid. Public responses include an asset and bounded diagnostics; geometry is read only through the existing owner-scoped board endpoint. The library immediately saves, opens its editor and allows normal grid/wall/portal edits. Token-art uploads remain image-only.

## Room saving and lifecycle

The checkbox adds `saveToLibrary=1` to UVTT preparation requests. The server requires the signed-in account to hold the active GM seat. The returned private preparation references the complete saved library asset. Cancellation discards preparation only, as normal image uploads already save to the library before Apply. Failed preparation creation cleans up the new row/image. A library-owned image is not recorded as a room-owned upload, so deleting a room cannot delete the reusable image. Subsequent room edits do not update the library silently; UI copy explains the initial save.

## Atomic application

`prepCommand` sets `includeLibraryBoard` for an owned library map. LiveRoom resolves the acting GM's account and asset inside its queue, validates the saved board, and passes the resolved map/grid/board to `decide`. A mismatched requested image is rejected. MapSet replaces geometry, including an empty saved board, and records previous map/grid/walls/fog and current token adjustments. No follow-up wall/fog commands are sent by the client. Reapplication does not append duplicate walls.

Existing composite filtering, reducers, guarded undo and replay handle the event without a new event type. Tests inspect two GM and two player connections, failed append recovery, owned/foreign access, library edit independence and persisted-log reload. See ADR 0043 for deployment and outstanding architecture review.

## Verification

Use the complete checked-in Dungeondraft export plus synthetic PNG/WebP files with nonzero origin, portal metadata and object LoS. Cover malformed files, expired sessions, authorization before validation, failed-save cleanup, checkbox selection, library editor review/edit/retry, round trips and one-command placement. Run strict OpenSpec validation, lint, typecheck, all tests including latency, build and health smoke. Hand browser testing to the user; do not claim manual/browser or external consumer results for this follow-up.
