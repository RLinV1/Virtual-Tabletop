# ADR 0033: Editing encounter templates in temporary rooms

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0024-encounter-templates.md`, `docs/adr/0009-room-deletion.md`
**Owner:** Real-Time Architecture · **Change:** `openspec/changes/encounter-template-editor` · **Requirements:** FR-GM-13

## Context

ADR 0024 lets a GM make an encounter template only by saving a live room: the server builds the data, and the client sends none. GMs now want to build and adjust templates from the library, and to replace a template from a room they fine-tuned instead of making a second copy.

A room-free editor that sends whole boards was considered first. It needs a body limit far above the API's 64 KB for templates at the 500-token and 100-fog caps, and it widens the trust boundary to browser-supplied boards. Rooms already have every editing tool a template needs.

## Decision

### A template is edited in a temporary room

A temporary room is a normal room with two fields on its storage row, not in room state:

- `rooms.temporary boolean not null default false`;
- `rooms.edits_encounter_id uuid null`, a foreign key to `encounter_templates` with `ON DELETE SET NULL`: the template its Save writes to, null for a new template until its first save.

Nothing in `Command`, `DomainEvent`, `RoomState`, `decide`, `reduce` or the visibility filters changes, and edits are ordinary commands with ordinary undo.

### Starting, saving and leaving

- `POST /api/library/encounter-edits { templateId | mapAssetId, guestToken }` (signed-in account) creates the room by the same steps as `POST /api/rooms`. From a template, it starts with `EncounterApplied` (ADR 0024). From a map, the map must be one of the caller's `map` assets with a saved grid, and the room starts with one `MapSet` that carries the grid. The GM's seat uses the account's display name.
- `GET /api/library/encounter-edits/:roomId` names the template being edited.
- `POST /api/library/encounter-edits/:roomId/save { name? }` builds the template from the room's live state with the ADR 0024 builder. With a linked template, it replaces that template's board, keeping its id, name, map and version; the room's map must still be the template's map (409 otherwise). Without one, `name` is required, the template is created under the usual limit and map rules, and the room is linked to it. Creating and linking are one store step (the room's row is locked in Postgres), so saves that overlap, after a double click or a retry, create one template: each one that finds the room already linked updates that template instead and answers 200.
- Leaving uses `DELETE /api/rooms/:roomId`, so a temporary room loses everything a deleted room does.

Every route answers 404 for a room that is not one of the caller's temporary rooms.

### Private and short-lived

- `listOwnedRooms` and `summarizeRooms` skip temporary rooms, so they appear on no dashboard or room list.
- An invite join to a temporary room answers exactly as an unknown invite.
- An hourly sweep deletes temporary rooms created more than 24 hours ago, through the same delete steps as the route.

### Replace from a room

`PUT /api/library/encounters/:id/from-room { roomId }` rebuilds a template from a normal room the caller owns, keeping its id, name, creation time and version. The room's map must be the template's map (409 otherwise).

### Summaries

`EncounterSummary` gains `mapAssetId` and `updatedAt`. Lists are ordered by `updatedAt`, newest first.

## Consequences

- One additive migration (`0013_temporary_rooms`); every existing room stays normal.
- ADR 0024's rule holds: the server builds every template from live room state, and no board crosses the API.
- `createRoomWithSeat` and `deleteRoomFully` (`domain/roomLifecycle.ts`) are now the one path for making and removing rooms (ADR 0009's delete steps are unchanged, only shared).
- Edits are written to the event log until the room is deleted; the sweep bounds how long.
- A GM still editing after 24 hours loses unsaved changes; saved changes are in the template.
- The web client hides tools in the editing mode as a convenience only (invariant 7); the server enforces joins, ownership and the map rule.
- Templates still carry no walls or portals, and a template's map never changes.

## Alternatives considered

- **A room-free editor that sends the board.** Needs a large body limit and client-supplied boards checked for ownership; duplicates the board's token and fog tools.
- **A `temporary` flag in `RoomCreated`.** Changes a shared event for something only the server and the GM's own browser need.
- **Keep the temporary room after leaving.** Leaves rooms nobody can see in the GM's storage.

## Amendment: prepared maps and template walls

Encounter editing now inherits a library map's saved walls, portals and fog. Template saves
retain walls and portals and each application gives them fresh ids. Version-one templates
without a walls field remain readable as having no walls. The encounter editor offers Grid and Fog;
wall editing stays in the map editor. The redundant Select-only tool rail is hidden while board
filters remain.
Grid save controls appear in the map editor header with the unsaved-change status.
