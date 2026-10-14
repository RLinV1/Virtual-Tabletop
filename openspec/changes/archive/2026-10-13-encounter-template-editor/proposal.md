## Why

A GM can only make an encounter template (FR-GM-13) by preparing a live room and saving it, and the library can only rename or delete one. Building or adjusting an encounter therefore means setting up a room by hand each time, and a template fine-tuned in a room can only come back as a second, duplicate template.

## What Changes

- **Edit in a temporary room.** The Encounters tab gets **New encounter** (pick one of the GM's library maps, setting its grid first if it has none) and each template card gets **Edit**. Both open a **temporary room** owned by the GM: started from the template, or from the chosen map with its grid and nothing else.
- **A focused editing mode.** The temporary room opens in a template-editing mode that shows only what manages the map, fog and tokens: the board with Select, the Tokens tab (Add Token with From creature, the roster), and the Manage tab's Edit map with its Grid and Fog steps. Everything else is hidden: Play and Dice tabs, chat, participants, invite and share, activity log, replay, checkpoints, the Encounter templates section, the Measure, Draw, AoE and Eraser tools, walls, and choosing a different map.
- **Save, Discard, Close.** Save writes the room's board to the template (or creates the template on its first save, asking for a name). The server builds the template from the room's live state, as for every room save. Discard and Close delete the temporary room; closing with unsaved changes asks to save, discard or keep editing.
- **Temporary rooms are private and short-lived.** They are hidden from the GM dashboard and room lists, refuse every invite join, and are deleted automatically when left behind.
- **No walls; the map is fixed.** Templates carry no walls and the editing mode hides them. A template's map is chosen when it is created and never changes; a different map means a new template.
- **Open in a room.** The editing mode offers **Open in a room**: after saving or discarding unsaved changes, the GM names the room (pre-filled with the template's name) and a normal room is created from the saved template.
- **Replace from a room.** A normal room's Encounter templates section offers **Save as new** or **Replace** one of the GM's templates, chosen from a list. The room's map must be the template's map.
- No new command or event and no change to `RoomState`. Room storage gains a temporary flag and the template a temporary room edits, so `packages/shared` protocol types change; this needs ADR 0033 and review by the Real-Time Architecture owner.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `encounter-templates`: templates can be created and edited in a private temporary room with a focused editing mode, opened as a normal room, and replaced from a room; the library lists templates by last save and offers New encounter and Edit.

## Impact

- `packages/shared`: `protocol.ts` (temporary-room start and save requests and responses, replace-from-room request, `mapAssetId` and `updatedAt` on `EncounterSummary`); `decide.ts` (`uniqueName`, shared by `uniqueTokenName`).
- `apps/server`: Prisma migration adding `rooms.temporary` and `rooms.edits_encounter_id`; room store methods for temporary rooms; `http/encounterEdits.ts` (start, read, save); `PUT /api/library/encounters/:id/from-room`; join refusal; dashboard and room lists skip temporary rooms; a sweep that deletes left-behind temporary rooms, sharing the delete route's steps; `LibraryStore.updateEncounter`.
- `apps/web`: an editing route that opens `RoomPage` in template-editing mode (banner, hidden tools); `MapSection` without map choice and walls in that mode; `LibraryPage.tsx` and `LibraryEncounters.tsx` (New encounter, Edit); `EncounterPanel.tsx` (Save as new or Replace); a shared create-room form for Open in a room; `api.ts`; tests.
- Docs: ADR 0033 amending ADR 0024.
