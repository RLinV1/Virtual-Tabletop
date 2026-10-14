## Why

The first save of a new encounter template reads the temporary room's link, creates a template, then links the room to it, in three separate store calls. Two saves that overlap (a double click on Save, or a retry) both read no link and both create a template. The library ends up with two templates, the room links to only one, and the extra one counts against the 50-template limit. A crash between creating and linking orphans a template the same way.

## What Changes

- The server creates a new template and links the temporary room to it in one atomic store call. If the room is already linked when that call runs, it creates nothing and returns the linked template's id.
- A save that loses the race updates the template the winner created and answers 200 with it, so concurrent or repeated first saves leave exactly one template.
- The store's separate `setEditsEncounter` call is removed; the new call replaces it.
- The editor's Save guards against a second request while one is in flight with a ref, not only React state, so a fast double click sends one request.

No change to `packages/shared`, the HTTP routes or their request and response shapes.

## Capabilities

### Modified Capabilities
- `encounter-templates`: overlapping first saves of a new template create one template.

## Impact

- `apps/server/src/store/roomStore.ts`, `memoryRoomStore.ts`, `postgresRoomStore.ts`: new `createEncounterForEditRoom`, `setEditsEncounter` removed.
- `apps/server/src/http/encounterEdits.ts`: the save route uses the new call and falls through to the update path when the room is already linked.
- `apps/web/src/pages/encounterEdit/EncounterEditBar.tsx`: in-flight guard on `save()`.
- Tests: `apps/server/test/libraryStore.test.ts` (store contract, memory and Postgres), `apps/server/test/encounterEdits.test.ts` (concurrent saves over HTTP).
- Docs: a note in `docs/adr/0033-encounter-template-editor.md`.
