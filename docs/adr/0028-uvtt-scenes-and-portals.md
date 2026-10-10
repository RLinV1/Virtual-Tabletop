# ADR 0028 — UVTT scenes, portal metadata and atomic geometry

**Status:** Proposed — Raymond Lin review required by CLAUDE.md
**Owner:** Real-Time Architecture (Raymond Lin)
**Implements:** KAN-43/44/49, FR-GM-06/07/12
**Extends:** ADR 0023 map-token-adjustment, ADR 0026 grid-detection-http-contract, ADR 0027 walls-and-wall-detection

## Context

UVTT carries image, square coordinates, polylines and generic portals. Separate scene and wall events expose intermediate state and weaken KAN-66's exact undo. Closed flags have different door/window interpretations across consumers.

## Decision

Keep Wall id/a/b, adding optional source (`line_of_sight` or `objects_line_of_sight`) and optional portal metadata (position, rotation, closed, freestanding). Preserve supplied fields; do not derive identity or replace position with a midpoint. Open portals do not block existing movement collision. Add GM wall.update / WallUpdated with full previous values.

Portal bounds take precedence over collinear solid geometry. Draft validation normalizes edited bounds; drawing solid walls skips portal bounds. An applied portal edit records any affected solid segments as WallsRemoved/WallsAdded in the same command batch, so guarded undo restores their exact previous values. Moving a portal does not invent solid walls for its former opening; the GM can draw those explicitly. An endpoint edit of a solid wall into a portal is refused with guidance to draw separate segments.

Add scene.importUVTT referencing an opaque prepared ID/revision. Store preparations in bounded expiring server memory; validate files and fully decode images off the room queue. Resolve a leased preparation inside LiveRoom's ordered queue through DecideContext; reject changed map/grid/walls, permit token movement and retain failed drafts. Successful receipts prevent duplicate commits.

MapSet gains optional wallChange containing complete replacement and previous arrays. New map replacements explicitly clear geometry in the same event. Import replaces geometry and records current KAN-66 token adjustments. Reduction copies values, with no derived geometry or implicit clearing on old events. Undo guards all changed values and appends exact inverses. Players receive filtered snapshots for composites and redacted wall updates.

Persist event payloads through a parameterized JSON text cast inside the existing Postgres append transaction. The current Prisma JSON input encoder changes some 17-digit doubles (observed `15.000000000000002` becoming `15`), which breaks exact checkpoint/undo comparisons. PostgreSQL JSONB preserves the supplied decimal text. Existing reads, table schema and event history stay unchanged; no historical event is rewritten. Concurrent append conflicts still become SeqConflictError.

Export captures a filtered immutable GM snapshot in the queue before private image I/O. Output is format 0.3 with normalized origin/grid phase, supported geometry and image only. No external URL reads, fractional-cell rounding, tokens, fog or history.

## Consequences and review

No new database migration; geometry stays in events/table snapshots. Preparations expire or disappear on restart. Web and server deploy together; rollback needs a compatible event reader. Strict validation and bounded workers constrain CPU/memory. Larger composite geometry travels only server-to-GM; inbound Socket.IO stays at 64 KiB.

Review specifically: optional legacy event fields; full-value wall undo guards; lease/receipt lifecycle under append failure; snapshot/player filtering; generic portal movement semantics. PR #94 is still a merge prerequisite despite accepted ADRs. KAN-45/46/47 and KAN-83 remain separate.
