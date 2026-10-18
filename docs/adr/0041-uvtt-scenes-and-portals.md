# ADR 0041 — UVTT scenes, portal metadata and atomic geometry

**Status:** Proposed — Raymond Lin review required by CLAUDE.md
**Owner:** Real-Time Architecture (Raymond Lin)
**Implements:** KAN-43/44/49, FR-GM-06/07/12
**Extends:** proposed ADR 0040 map-token-adjustment; accepted ADR 0028 grid-detection, 0029 walls, 0030 portals, 0032 fog; proposed ADR 0031 editor context

## Context

UVTT carries image, square coordinates, polylines and generic portals. Separate scene and wall events expose intermediate state and weaken KAN-66's exact undo. Closed flags have different door/window interpretations across consumers.

## Decision

Keep Wall id/a/b and the accepted `portal?: { kind: door | window, state: open | closed | locked }`. Add optional `uvttPortal?: { position?, rotation?, closed?, freestanding? }` and source (`line_of_sight` or `objects_line_of_sight`). Preserve supplied metadata/absence without inferring identity or midpoint. Generic imports are GM-only and use their supplied closed flag for collision; a missing flag conservatively blocks. Explicit GM designation reuses the existing portal tools, commands and events, and runtime state then controls collision and export.

Players retain ADR 0030 visible portal endpoints/kind/state and player toggles. Project visible walls to those fields only; strip UVTT metadata and source. A full WallUpdated never reaches a player: visible portal geometry changes produce a filtered snapshot; concealed/plain/generic edits are redacted. No draft IDs, history, replaced values or embedded images reach players.

The library-map geometry contract added on main (ADR 0037) reuses `Wall.omit({ id: true })`, so full-value edits in the shared wall editor preserve optional UVTT metadata and source through owned-library storage and copies into rooms. Existing strict validation, wall limits, room-assigned IDs and player filtering still apply. This adds no library UVTT file-import workflow or migration.

Portal bounds take precedence over collinear solid geometry. Draft validation normalizes edited bounds; drawing solid walls skips portal bounds. An applied portal edit records any affected solid segments as WallsRemoved/WallsAdded in the same command batch, so guarded undo restores their exact previous values. Moving a portal does not invent solid walls for its former opening; the GM can draw those explicitly. An endpoint edit of a solid wall into a portal is refused with guidance to draw separate segments.

Add scene.importUVTT referencing an opaque prepared ID/revision. Store preparations in bounded expiring server memory; validate files and fully decode images off the room queue. Resolve a leased preparation inside LiveRoom's ordered queue through DecideContext; reject changed map/grid/walls/fog, permit token movement and retain failed drafts. Successful receipts prevent duplicate commits.

MapSet gains optional wallChange and fogChange containing complete replacement and previous arrays. Different-image replacement clears geometry/fog in the same event; import replaces geometry and clears prior-image fog. Capture/guard fog with the preparation baseline; token motion alone still passes. Import replaces geometry and records current KAN-66 token adjustments. Reduction copies values, with no derived geometry or implicit clearing on old events. Undo guards all changed values and appends exact inverses. First placement inverse allows map=null. Reconcile main's map-history retirement with that nullable inverse and its newer group/portal undo events. Players receive filtered snapshots for composites and visibility-aware wall updates.

Persist event payloads through a parameterized JSON text cast inside the existing Postgres append transaction. The current Prisma JSON input encoder changes some 17-digit doubles (observed `15.000000000000002` becoming `15`), which breaks exact checkpoint/undo comparisons. PostgreSQL JSONB preserves the supplied decimal text. Existing reads, table schema and event history stay unchanged; no historical event is rewritten. Concurrent append conflicts still become SeqConflictError.

Export captures a filtered immutable GM snapshot in the queue before private image I/O. Output is format 0.3 with normalized origin/grid phase, supported geometry and image only. No external URL reads, fractional-cell rounding, tokens, fog or history. Export native and imported portals with current open/closed state. Door/window identity and locking have no UVTT fields: warn and export locked as closed; supported round trips cover geometry, position/rotation/freestanding and open/closed movement. Imported closed remains source metadata in state; for designated portals export uses the current runtime state instead. No reducer silently changes the source flag on PortalChanged.

## Consequences and review

No new database migration; geometry stays in events/table snapshots. Preparations expire or disappear on restart. Web and server deploy together; rollback needs a compatible event reader. Strict validation and bounded workers constrain CPU/memory. Larger composite geometry travels only server-to-GM; inbound Socket.IO stays at 64 KiB.

Review specifically: optional legacy event fields; full-value wall undo guards; lease/receipt lifecycle under append failure; snapshot/player filtering; generic portal movement semantics. PR #94/#99 are merged at main ec9aa66; the current KAN-66/KAN-67 prerequisite b7a8ba1 (#86) remains open. Both this ADR and the renumbered ADR 0040 remain Proposed. Use the existing private mapDraft/draftConnection and preserve detection result IDs, command context guards, portal behavior and fog.replace. Dynamic LoS and KAN-83 remain separate.
