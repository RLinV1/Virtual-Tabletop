## 1. Contract and ADR

- [x] 1.1 Write `docs/adr/0033-encounter-template-editor.md` amending ADR 0024 (temporary editing rooms, their storage fields, join refusal and sweep, save from a temporary room, replace from a room) and request Real-Time Architecture owner review; verify the ADR is linked from ADR 0024
- [x] 1.2 In `packages/shared/src/protocol.ts` keep `SaveEncounterRequest` as `{ roomId, name }`, add `StartEncounterEditRequest`, `StartEncounterEditResponse`, `EncounterEditSession`, `SaveEncounterEditRequest` and `ReplaceEncounterFromRoomRequest`, and add `mapAssetId` and `updatedAt` to `EncounterSummary`; remove the board-upload request types; verify with `npm run typecheck`
- [x] 1.3 Extract a list-based `uniqueName(taken, name)` into `packages/shared` and make `uniqueTokenName` use it; verify existing token-name tests pass and a new unit test covers "Goblin" → "Goblin 2" → "Goblin 3"

## 2. Server: storage

- [x] 2.1 Add `updateEncounter(id, ownerGmId, { name, data, updatedAt })` to `LibraryStore` in the memory and Postgres stores, order `listEncounters` by `updatedAt` desc; verify with cases in `apps/server/test/libraryStore.test.ts` (update, foreign owner returns null, ordering)
- [x] 2.2 Add Prisma migration `0013_temporary_rooms` (`rooms.temporary`, `rooms.edits_encounter_id` with `ON DELETE SET NULL`) and the store methods `createRoom` options, `findEditSession`, `setEditsEncounter` and `listTemporaryRoomsBefore` in the memory and Postgres stores; make `listOwnedRooms` and `summarizeRooms` skip temporary rooms; verify with store contract tests

## 3. Server: routes

- [x] 3.1 Remove the board-upload create and edit routes and `checkTemplateData` with its tests, keeping `boardFromRoom`; verify `apps/server/test/encounters.test.ts` room-save tests still pass
- [x] 3.2 Factor room creation in `POST /api/rooms` into `createRoomWithSeat` and the delete route's steps into `deleteRoomFully`; verify the existing room creation, template room and delete-room tests pass unchanged
- [x] 3.3 Add `http/encounterEdits.ts`: `POST /api/library/encounter-edits` (from a template, or from a library map with a saved grid), `GET /api/library/encounter-edits/:roomId` and `POST /api/library/encounter-edits/:roomId/save`; verify with integration tests for both starts, first save naming and creating, later saves updating, map changed (409), foreign room or template (404), signed out (401) and walls not saved (FR-GM-13)
- [x] 3.4 Refuse invite joins to temporary rooms as an unknown invite, and keep them off the dashboard and joined-room lists; verify with integration tests
- [x] 3.5 Add the hourly sweep deleting temporary rooms opened more than 24 hours ago through `deleteRoomFully`; verify with a test using an injected clock that an old temporary room is deleted and a normal room and a fresh temporary room are kept
- [x] 3.6 Add `PUT /api/library/encounters/:id/from-room { roomId }`, reusing the room-save builder and keeping id, `createdAt` and version; verify with integration tests for replace, different map (409, unchanged), foreign template or room (404) and walls not saved

## 4. Web: template-editing mode

- [x] 4.1 Add `api.library.encounterEdits.start`, `get` and `save`, `api.library.encounters.replaceFromRoom`, and store the temporary room's credential like any created room; verify with `npm run typecheck`
- [x] 4.2 Add the `/encounters/edit/:roomId` route opening `RoomPage` in editing mode, and a `RoomFeatures` object that hides, in that mode, Home, participants, share, activity log, replay, the guide, the Play and Dice tabs, chat, notices, the roll card, departed players, checkpoints, the Encounter templates section, every tool but Select, the Walls step and map choice; verify with component tests that the editing mode shows the Tokens and Manage tabs, Select, and Edit map's Grid and Fog, and none of the hidden controls
- [x] 4.3 Add the editing banner with the template name, Save (asking a name on a new template's first save), Discard and Close (Save / Discard / Keep editing prompt when the room's seq moved since the last save), each leaving by deleting the temporary room; verify with component tests for save, the name prompt, discard and the close prompt
- [x] 4.4 Extract the room-name, display-name and preset fields of `CreateRoomCard` (`GmDashboardPage.tsx`) into a shared form component, keeping the dashboard's behaviour; verify the existing dashboard tests still pass
- [x] 4.5 Add Open in a room (save-first prompt when dirty, disabled until saved, then a dialog with the shared fields and the room name pre-filled with the template's name; `POST /api/rooms` with `templateId`, delete the temporary room, then navigate); verify with component tests that a dirty room saves before the room request, an edited name is sent, and a blank name or Cancel sends nothing

## 5. Web: library and room

- [x] 5.1 In `LibraryPage.tsx` add New encounter to the Encounters tab (pick one of the GM's library maps, run grid setup when it has none, start an editing session and navigate) and update the empty-state text; verify with a test in `apps/web/test/encounterTemplates.test.tsx`
- [x] 5.2 In `LibraryEncounters.tsx` add Edit to each card (hidden when the map was deleted) that starts an editing session, and show the saved time; verify with a test
- [x] 5.3 In `EncounterPanel.tsx` offer Save as new or Replace with a template picker that marks templates on a different map, plus a confirmation; verify with a test that Replace calls the from-room route with the chosen id

## 6. Verification

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 6.2 Run the app and check the full loop by hand: New encounter, add creatures and fog, Save, Close, Edit, Open in a room with a new name, change a token, Replace, Edit again and see the change; confirm the temporary room never appears on the dashboard; record the result in the change folder
