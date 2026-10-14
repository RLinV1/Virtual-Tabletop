## Context

The board is `TableState = { scene, tokens, templates, fog, initiative }` (`state.ts`). Checkpoints (ADR 0019) already restore a whole table through one event: `checkpoint.restore` → `DecideContext.checkpointTable` → `CheckpointRestored { restored, previous }`, filtered to a `resync` for players and reversible by swapping `restored` and `previous`. Library rows (assets, creatures, dice looks) live in `LibraryStore` beside the event log, are owned by `ownerGmId`, and answer 404 across owners. `POST /api/rooms` creates a room and appends `RoomCreated` and `ParticipantJoined` with `appendSystem`. Room state has no walls or portals yet. A map reaches a room by `MapImage.assetId` (library) or a direct upload, and room deletion removes direct uploads (`routes.ts` delete route).

## Goals / Non-Goals

**Goals:**
- Save a prepared board once, reuse it in a new or existing room.
- Reuse the checkpoint restore mechanism so apply is atomic, reversible and safe for players.
- Keep templates private to the GM account.

**Non-Goals:**
- Walls and portals (not in state yet; the format is versioned for them).
- Merging a template into a board that already has content.
- Sharing templates between GMs, or importing and exporting them.
- Template thumbnails and folders.
- Saving participants, chat, rolls or checkpoints.

## Decisions

### 1. A new library table, not a room or a checkpoint
`encounter_templates (id, owner_gm_id, name, data jsonb, version int, created_at, updated_at)`, with `LibraryStore` methods `listEncounters`, `findEncounter`, `createEncounter`, `renameEncounter`, `deleteEncounter`, `countEncounters`, all scoped by owner. `data` is `EncounterTemplateData` (zod): `{ map: { assetId, width, height }, grid, tokens[], fog[] }`. Version 1.

*Alternative:* reuse checkpoints with a cross-room restore. Rejected: a checkpoint is a seq in one room's log, owned by the room, and depends on replay of that log.

### 2. The server builds the template from live state
`POST /api/library/encounters { roomId, name }`. The route requires an account that owns the room (`listOwnedRooms`), loads the room through the registry, and builds the data from `tableOf(state)` (the GM sees everything, so hidden tokens are included). The client sends no board data, so a forged template cannot be stored. Tokens drop `ownerIds`, `initiative` and ids. Area templates and initiative are not saved: they are live-play objects.

### 3. Maps must be library maps
A direct upload belongs to its room and is deleted with it, which would leave the template pointing at a missing file. Save therefore requires `scene.map.assetId` to be one of the GM's `map` assets and stores the asset id; apply resolves the URL from the asset at that moment, so a changed URL stays correct. Deleting a map warns through `assetUsage`, which also lists templates. If the asset is gone at apply time, apply answers 409 and changes nothing.

*Alternative:* copy the map file per template. Rejected for storage cost and for needing cleanup rules.

### 4. Apply is `encounter.apply`, modelled on `checkpoint.restore`
Command `encounter.apply { templateId }`. `LiveRoom.submit` fills `DecideContext.encounterTemplate?(templateId)` for this command only, inside the room's exclusive queue. The server loads the template for the sender's account (an id that is not theirs reads as missing), validates it, and resolves the map URL. `decide` authorises (GM only), then builds the applied table, giving each token a fresh id from `ctx.newId`, and emits `EncounterApplied { templateId, name, applied: TableState, previous: TableState }` (invariant 6). `decide` stays pure because the context supplies the template data and ids come from `ctx.newId`. `reduce` swaps the table in, exactly as `CheckpointRestored` does, with `initiative: null` and no area templates. Participants, chat, rolls, checkpoints and name are untouched.

### 5. Players get a resync; the event is GM-only
`filterEventForViewer` returns `resync` for `EncounterApplied` for non-GM viewers, as for `CheckpointRestored`. The event holds hidden tokens and fog, so it is never nested-filtered. `previous` can hold tokens with owners; only the GM ever receives it.

### 6. Reversible
`EncounterApplied` joins `REVERSIBLE_EVENT_TYPES` with `applied` and `previous` swapped as its inverse, and closes earlier board-edit undo history like a restore (ADR 0019). One apply is one undo entry.

### 7. New room: same table, applied at creation
`POST /api/rooms` takes optional `templateId`. Before creating anything it loads and validates the template and resolves the map (409 on failure, no room created). After `RoomCreated` and `ParticipantJoined` it appends `EncounterApplied` with `previous` an empty table, via `appendSystem`. One code path builds the table for both cases.

### 8. Replace, not merge
Merging needs rules for overlapping tokens, scene conflicts and fog union. Replace with a confirmation dialog and one-click undo covers "run this encounter in my room" with one behaviour to test. A merge mode can be added later as a flag on the same command.

### 9. Limits
50 templates per GM, name 1 to 60. A template never holds more tokens or fog regions than a room can, because it is built from one.

## Risks / Trade-offs

- [New command, event and visibility rule] → Follows ADR 0019 closely; needs ADR 0024 and owner review.
- [A template sits for a long time while the state shape changes] → `version` plus zod validation on apply; unknown versions are rejected with nothing committed.
- [A map deleted after saving breaks apply] → The map's usage warning lists templates; apply fails cleanly with 409.
- [Replace loses work] → Confirmation dialog, plus undo restores the exact previous board, owners included.
- [A large event with two full tables] → Bounded by existing token and fog caps; GM-only.
- [A hidden token the GM forgot about is saved] → Intended: the template is the GM's prep and stays private to the GM.

## Migration Plan

Additive Prisma migration creating `encounter_templates`. No backfill. Web and server deploy together, as for every event addition. Rollback: drop the table; rooms never reference a template id after apply.

## Open Questions

- None blocking. Assumption recorded: walls and portals join the template when they exist in state (separate change).
