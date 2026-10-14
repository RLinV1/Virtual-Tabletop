## Context

See proposal.md for motivation; requirements are in `specs/encounter-templates/spec.md`.

Today (ADR 0024) a template is an `encounter_templates` row built only by the server from a live room (`room.boardForOwner()` in `http/encounters.ts`). `POST /api/rooms { templateId }` already creates a room started from a template by appending `EncounterApplied` with `appendSystem`. Rooms already have everything an editor needs: token create, move, hide and delete commands with undo, Add Token's From creature, grid snapping, duplicate-name numbering, and the map editor overlay's Grid and Fog steps (`GmPanel` → `MapSection`). Rooms have no notion of being temporary (`model Room` in `schema.prisma`), and the API's JSON body limit is 64 KB.

An earlier version of this design built a separate room-free editor that sent whole boards to the server. It was dropped: whole boards exceed the 64 KB body limit, and it widened the trust boundary that ADR 0024 keeps narrow.

## Goals / Non-Goals

**Goals:**
- Edit templates with the room's own, already-tested editing tools.
- Keep ADR 0024's rule that the server builds every template from live room state.
- Temporary rooms that nobody else can see or join and that clean themselves up.

**Non-Goals:**
- A new board or token editor outside the room page.
- Walls, portals or a different map in a template.
- Players in a temporary room.
- Concurrent edits of one template from two temporary rooms (last save wins).

## Decisions

### 1. A temporary room is a normal room with two stored fields
`rooms.temporary boolean not null default false` and `rooms.edits_encounter_id uuid null` (FK to `encounter_templates`, `ON DELETE SET NULL`), in one additive migration. These live in room storage, not in `RoomState`: nothing in the event log, `decide`, `reduce` or the visibility filters changes, so invariants 1 to 6 hold as they are. `store.createRoom` takes `{ temporary, editsEncounterId }`. New store methods: `findEditSession(roomId, ownerGmId)` → `{ editsEncounterId } | null` (temporary rooms only, scoped by owner), `setEditsEncounter(roomId, id)`, and `listTemporaryRoomsBefore(at)`.

*Alternative:* a flag in `RoomCreated`. Rejected: it changes a shared event schema for something only the server and the GM's own browser need.

### 2. Starting an editing session
`POST /api/library/encounter-edits { templateId } | { mapAssetId }`, each with the browser's `guestToken`, signed-in account only. The room is created by the same steps as `POST /api/rooms`, factored into one `createRoomWithSeat` helper so the seat, membership and `RoomCreated` follow one path. The GM's seat uses the account's display name, and the room is named after the template, or "New encounter".
- `templateId`: resolved with `resolveEncounter` before anything is created (404 or 409 as for room creation), then `EncounterApplied` as now. `edits_encounter_id` is set.
- `mapAssetId`: must be one of the GM's `map` assets with a saved grid (400 otherwise, the same response for missing, foreign or wrong kind). The room starts with `MapSet` and `GridSet` system events for that map and grid. `edits_encounter_id` stays null until the first save.

The response is `{ roomId, participantId }`; the browser stores its credential as it does for any room it creates.

### 3. Saving
`POST /api/library/encounter-edits/:roomId/save { name? }`:
- With `edits_encounter_id` set: rebuild from the room with the room-save builder (`boardFromRoom`), check the room's map is the template's map (409 otherwise), and `updateEncounter`, keeping the id, map, version and creation time. `name` is ignored.
- Without one (a new template): `name` is required; create the template exactly as a room save does (limit, map rule), then `setEditsEncounter` so later saves update it.

Unsaved changes are tracked in the browser: the room's `seq` at the last save, compared with the current `seq`. That is a UI hint only.

`GET /api/library/encounter-edits/:roomId` → `{ templateId, templateName, mapAssetId }` lets the editing page show the name and know whether a save needs a name. Every route answers 404 for a room that is not one of the caller's temporary rooms.

### 4. Leaving deletes the room
Discard, Close and Open in a room end with the existing `DELETE /api/rooms/:roomId`, so a temporary room loses everything a deleted room does. The delete steps (close in the registry, delete in the store, evict, forget wall detections, delete uploads) move into one `deleteRoomFully` helper used by the route and the sweep.

### 5. Hidden and closed to others
`listOwnedRooms` and `summarizeRooms` (dashboard, joined rooms) skip temporary rooms. `POST /api/invites/:inviteCode/join` answers 404 "Invite not found" for a temporary room, the same as an unknown code. The invite routes stay as they are: nobody can use the code.

### 6. Cleanup sweep
Every hour, `deleteRoomFully` runs for temporary rooms created more than 24 hours ago, started beside the existing sweeps in `app.ts` (`unref`'d, stopped on close). A GM still editing at 24 hours loses only unsaved work; saved changes are already in the template.

### 7. Template-editing mode on the web
A client route `/encounters/edit/:roomId` renders `RoomPage` with `editing` set. `Room` reads the session from `GET /encounter-edits/:roomId`. A `RoomFeatures` object passed down hides, in editing mode:
- top bar: Home, participants, share, activity log, the room menu's replay and guide; it shows an editing banner instead (template name, Save, Open in a room, Discard, Close);
- tabs: only Tokens and Manage;
- Manage: `MapSection` without map choice and without the Walls step (Grid and Fog stay); no departed players, checkpoints or Encounter templates;
- board: only the Select tool on the tool rail; no chat, turn or departure notices, or roll card.

These are UI hints (invariant 7); the server rules that matter are the map check on save, the join refusal, and owner-scoped routes.

### 8. Library and room UI
- Encounters tab: **New encounter** opens a picker of the GM's library maps. A map without a grid opens the library's grid setup first (`gridTarget` in `LibraryPage.tsx`), then the session starts. Cards get **Edit** (hidden when the map was deleted).
- Open in a room: the dashboard `CreateRoomCard` fields move into a shared form, used in a dialog with the room name pre-filled from the template name. It sends `POST /api/rooms { templateId }`, then deletes the temporary room and navigates.
- `EncounterPanel` (normal rooms only): Save as new or Replace with a picker; `EncounterSummary.mapAssetId` marks templates on another map; Replace calls `PUT /api/library/encounters/:id/from-room`.

### 9. Shared naming helper
`uniqueName(namesInUse, name)` in `packages/shared`, used by `uniqueTokenName`. Rooms already number duplicates, so the editing mode needs nothing more; the helper stays as a small general utility.

## Risks / Trade-offs

- [Edits are written to the event log until the room is deleted] → Bounded by the 24-hour sweep and by delete on leave; the same storage any room uses.
- [A GM editing for more than 24 hours loses unsaved work] → Rare; the banner's unsaved marker encourages saving, and saved work is kept.
- [Hiding tools in the client is not enforcement] → Nothing hidden is dangerous in a room only the GM is in; joins are refused by the server and saving is checked on the server.
- [Two temporary rooms editing one template] → Last save wins; a non-goal.
- [`createRoom` and delete steps move into helpers] → Existing room creation and delete integration tests cover the refactor.
- [Shared protocol and room-storage changes] → ADR 0033 and Real-Time Architecture owner review.

## Migration Plan

Additive Prisma migration `0013_temporary_rooms` (two columns, defaults keep every existing room normal). Server and web deploy together. Rollback: drop the routes and UI; the columns can stay or be dropped; delete any rows with `temporary = true` first.
