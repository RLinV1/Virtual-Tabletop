# Design

## Context

See proposal.md for scope. The implementation stacks on PR #94 at 8c3c10a; its ADRs 0026/0027 are accepted. KAN-66's atomic MapSet has been reconciled onto that baseline. Some wall/editor/undo specs are still pending changes rather than archived capabilities. ADR number 0028 is free (existing duplicate 0023/0027 numbers are left intact).

## Goals / Non-Goals

Publish only a complete server-validated image/grid/geometry, preserving generic portal data and exact undo. No door/window inference, locking, player portal UI, dynamic visibility, library import or multiple scenes.

## Decisions

1. Pure shared UVTT schema and normalization. Supported flat formats 0.2/0.3/1.0; missing optional arrays mean empty. Strict supported data errors reject the entire file. Unknown lights/environment/extensions warn. Full image decoding belongs to a server worker; one active job, two queued, 30 second timeout. Limit input to 40 MiB, image to 25 MiB, 32 MP and 16384 pixels per edge. Raw supported geometry is additionally limited to 10000 points/items before normalization to bound processing; excessive data is rejected, never truncated. Diagnostics are twenty bounded paths/codes, never raw values.
2. Board pixels are `(point - origin) * pixels_per_grid`; grid phase is positive modulo of negative scaled origin. Preserve portal position independently of bounds and rotation in radians. Flatten adjacent polyline points, clip crop crossings, subtract collinear solid overlap at portals, then enforce 1500 walls. Grid edits change alignment without moving geometry.
3. Reuse Wall endpoints as portal bounds; optional portal metadata and source distinguish objects. Open portals do not block movement; closed portals and old walls do. GM-only wall.update records previous full values. No parallel portal table or new database schema.
4. Dedicated authorized REST preparation APIs use opaque revisions and existing AssetStore/room uploads. Bind drafts to GM and room, TTL 30 minutes, two per pair/twenty per process. Images needed by history remain until room deletion. Raw upload/temporary files are always removed. Restart loses preparations and requires explicit re-import.
5. Capture baseline map/grid/walls in the room queue. Resolve a leased revision inside submit; stale geometry/map/grid rejects, token motion does not. Apply records current token adjustment and new wall IDs from ctx.newId in one MapSet with optional wallChange. Append failure releases the lease and retains the draft. Successful receipts make Apply idempotent. Ordinary image replacements explicitly clear walls in the same event; historical MapSet replay never clears implicitly.
6. Undo guards map/grid/full walls/affected tokens, restores exact previous values (including no map), and appends ActionUndone. Wall edits/undo use full-value equality. Player composite events cause filtered snapshots, wall updates are redacted; drafts/history/previous values never reach players.
7. Export captures a cloned filtered GM snapshot and sequence in the queue, then reads image bytes outside it. Resolve only owned library/room upload records or the built-in allowlist. PNG/WebP bytes survive unchanged; JPEG becomes PNG with identical dimensions. Format 0.3 uses origin `mod(-offset/cellSize,1)` and image size/cellSize. Fractional cell sizes fail with guidance; no resampling.
8. Mount the 1 MiB draft JSON parser on the authorized PUT route ahead of the global 64 KiB parser. Keep Socket.IO limit unchanged. Authenticate room, active GM and live session before reading multipart. Preserve same-origin checks and limit preparation attempts to five/minute per GM/room.
9. Preserve exact JS doubles in new Postgres event payloads by inserting parameterized JSON text cast to JSONB within the current append transaction. The Prisma JSON input encoder otherwise changes some 17-digit values, invalidating checkpoint/undo guards. Keep legacy readers/schema/history and concurrent sequence-conflict behavior unchanged.

Portal endpoint edits normalize collinear solid overlap both in private draft validation and applied wall command batches. Applied edits record affected solid removals/additions alongside WallUpdated; undo restores all exact values. Drawing skips portal gaps. Moving a portal does not reconstruct unknown solid geometry at its former opening.

## Risks / Trade-offs

- Portal `closed` has consumer-specific meanings → preserve generic metadata and test supported round trips without claiming door/window equivalence.
- Local preparations are lost on restart → explicit re-import error; no persistent scenes added.
- New persisted events cannot be read by old reducers → deploy server/web together, retain a compatible reader on rollback.
- Real-file provenance, owner review and licensed consumer/browser availability → record evidence and leave external release gates open until independently verified.

## Migration Plan

No new database migration beyond the prerequisite wall/account/encounter migrations. Validate OpenSpec strictly and run lint, typecheck, tests including benchmark, build and health smoke. Review ADR 0028 with Raymond Lin alongside ADRs 0023, 0026 and 0027. Merge the prerequisite before this stacked implementation. Do not rewrite event history during rollback.
