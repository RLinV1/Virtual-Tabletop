## Why

KAN-50 (FR-GM-13) asks that a GM save a prepared encounter and reuse it across sessions. Today a GM who preps a map, grid, monster tokens and fog for one session must rebuild it by hand for the next room. Library creatures (KAN-70) cover single monsters, and checkpoints (ADR 0019) restore a board inside one room, but nothing carries a whole prepared board from one room to another.

## What Changes

- A GM can **save the current board of a room they own as a named encounter template**. The template holds the map (a library map), the grid, the tokens (without owners) and the fog regions. It belongs to the GM's account and appears in the GM's library.
- A GM can **list, rename and delete** their templates. Another GM's template answers 404, as for creatures and assets.
- A GM can **apply a template to a new room** (an option when creating a room) **or to an existing room they run**. Applying to an existing room replaces the board, asks for confirmation, and is one undoable action.
- New command `encounter.apply` and event `EncounterApplied`, modelled on `checkpoint.restore` / `CheckpointRestored`. Players get a filtered resync, never the event.
- **Schema change** in `packages/shared` (new command, event, protocol types). Needs an ADR (0024) and Real-Time Architecture owner review.
- Walls and portals are **not** in the template yet: they do not exist in room state (FR-GM-06/07/18 are planned). The template format is versioned so they can be added without breaking saved templates.

## Capabilities

### New Capabilities

- `encounter-templates`: saving a room's prepared board as a GM-owned template, managing templates, and applying one to a new or existing room.

### Modified Capabilities

None.

## Impact

- `packages/shared`: `state.ts` (template data type, `tableOf` reuse), `commands.ts` (`encounter.apply`), `events.ts` (`EncounterApplied`), `decide.ts`, `reducer.ts`, `visibility.ts`, `undo.ts`, `protocol.ts` (REST request and response types).
- `apps/server`: Prisma migration `encounter_templates`; `LibraryStore` methods in the memory and Postgres stores; new `http/encounters.ts` routes; `POST /api/rooms` accepts an optional `templateId`; `LiveRoom.submit` fills the template into `DecideContext`; asset usage counts templates.
- `apps/web`: Library page "Encounters" section; room menu "Save as encounter template" and "Apply template"; create-room dialog "Start from template".
- Tests across shared, server and web.
