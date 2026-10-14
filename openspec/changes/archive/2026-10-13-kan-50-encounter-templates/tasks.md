## 1. ADR

- [x] 1.1 Write `docs/adr/0024-encounter-templates.md` (new command, event, library table, visibility, undo); get Real-Time Architecture owner sign-off; link it from ADR 0019 and ADR 0004

## 2. Shared contract

- [x] 2.1 Add `EncounterTemplateData`, its version constant and REST request and response types (`protocol.ts`); verify `npm run typecheck`
- [x] 2.2 Add `encounter.apply` and `EncounterApplied`, `DecideContext.encounterTemplate`; handle in `decide` (GM only, fresh token ids from `ctx.newId`, `previous` from current state) and `reduce` (swap table, clear initiative and area templates); verify `packages/shared/test/encounterApply.test.ts` (`describe("apply encounter template (FR-GM-13)")`): GM applies, player forbidden, missing template rejected, participants, chat and rolls unchanged, initiative cleared
- [x] 2.3 Filters: `resync` for players on `EncounterApplied`; verify hidden token and fog are absent from every player payload
- [x] 2.4 Add `EncounterApplied` to the reversible set with swapped inverse; verify undo restores owners and tokens exactly, and that earlier board-edit undo entries close

## 3. Server

- [x] 3.1 Prisma migration `encounter_templates`; `LibraryStore` methods in the memory and Postgres stores, scoped by owner; cap of 50; verify store tests including cross-owner 404 (memory store verified; Postgres contract tests skipped, no DATABASE_URL)
- [x] 3.2 `http/encounters.ts`: list, create from room (server builds data, owner-of-room check, library-map check, name check), rename, delete; verify `apps/server/test/encounters.test.ts` for each scenario in the spec
- [x] 3.3 `LiveRoom.submit` fills `encounterTemplate` for `encounter.apply` from the sender's own templates, resolves the map URL, validates data and version; verify forged id, other GM's id, deleted map (409), unknown version
- [x] 3.4 `POST /api/rooms` accepts `templateId`; fail before creating anything; append `EncounterApplied` after join; verify the new room has the board
- [x] 3.5 `assetUsage` includes templates; verify the map usage warning lists a template
- [x] 3.6 Multi-client integration test (`describe("encounter templates (FR-GM-13)")`): GM applies a template with a hidden token; a player resyncs without it; undo returns the old board

## 4. Web

- [x] 4.1 Library page "Encounters" section: list, rename, delete, usage text
- [x] 4.2 Room menu "Save as encounter template" (name prompt, map-not-in-library message) and "Apply template" (picker, confirmation, sends `encounter.apply` through `RoomConnection.command`)
- [x] 4.3 Create-room dialog "Start from template"; show the 409 message
- [x] 4.4 Web tests for the three flows

## 5. Verify

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`
- [x] 5.2 Verify the flows in the browser (built-in browser; Playwright MCP failed to connect): save from a prepped room, create a new room from it, apply to an existing room, undo
