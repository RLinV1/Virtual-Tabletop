# Tasks

## 1. Store

- [x] 1.1 Add `createEncounterForEditRoom` to `RoomStore` and remove `setEditsEncounter`; verify `npm run typecheck` fails only at the two store implementations and the save route.
- [x] 1.2 Implement it in `MemoryRoomStore` with no `await` between the link check, limit, map check, insert and link; verify the store contract tests in 1.4 pass on memory.
- [x] 1.3 Implement it in `PostgresRoomStore` as one transaction (room row `FOR UPDATE`, then the shared advisory-lock/count/insert helper also used by `createEncounter`, then the link); verify the contract tests in 1.4 pass with `DATABASE_URL` set.
- [x] 1.4 Replace the `setEditsEncounter` assertions in `apps/server/test/libraryStore.test.ts` with contract tests (FR-GM-13): creates and links; an already-linked room returns `{ linkedTo }` and creates nothing; another owner's or a normal room returns null; a limit or missing-map error creates and links nothing; two calls under `Promise.all` leave one template and a link to it.

## 2. Save route

- [x] 2.1 Move the update branch of `POST /api/library/encounter-edits/:roomId/save` into a local helper and use `createEncounterForEditRoom` for a new template: `{ created }` answers 201, `{ linkedTo }` runs the update helper and answers 200, null answers 404, and a linked template deleted before the update retries the create once; verify the existing `encounterEdits.test.ts` cases still pass.
- [x] 2.2 Add to `apps/server/test/encounterEdits.test.ts` (FR-GM-13): two first saves of a new encounter sent with `Promise.all` both succeed with the same id, the library lists one template, and `GET /api/library/encounter-edits/:roomId` returns that id.

## 3. Client

- [x] 3.1 Guard `save()` in `apps/web/src/pages/encounterEdit/EncounterEditBar.tsx` with a `savingRef` set before the request and cleared in `finally`; verify with a component test in `apps/web/test/encounterEditMode.test.tsx` that two clicks on Save before React re-renders send one save (FR-GM-13).

## 4. Docs and checks

- [x] 4.1 Note in `docs/adr/0033-encounter-template-editor.md` (Starting, saving and leaving) that the first save creates and links the template atomically and that an overlapping first save updates the template it created.
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test`, plus `DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt npm test --workspace=@vtt/server` for the Postgres contract tests.
