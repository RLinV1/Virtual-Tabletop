# Design

## Context

`POST /api/library/encounter-edits/:roomId/save` (`apps/server/src/http/encounterEdits.ts`) does three things on a new template's first save: `findEditSession` reads `editsEncounterId`, `createEncounter` inserts the template, and `setEditsEncounter` links the room. `createEncounter` is already atomic against the per-GM limit (Postgres takes `pg_advisory_xact_lock` on the owner; memory has no `await` between the count and the insert), but nothing makes the read and the link atomic. See proposal.md for the failure.

The client guard in `EncounterEditBar.save()` is `setBusy(true)`. The button only becomes disabled on the next render, so two clicks in the same frame both call `save()`. `LibraryGridEditor` in `LibraryPage.tsx` already handles this with a `savingRef`.

Store contract tests in `apps/server/test/libraryStore.test.ts` run against memory and, when `DATABASE_URL` is set, Postgres (`storeHarness.ts`).

## Goals / Non-Goals

**Goals:**
- One template per new-template editing session, however many first saves overlap, on one server or several.
- Creating and linking cannot be separated by a crash.
- An overlapping or retried first save succeeds, rather than failing with an error.

**Non-Goals:**
- Ordering between overlapping updates of an existing template. Last write wins, as now; both writes come from the same live room.
- `POST /api/library/encounters` (Save as new from a normal room). Each call there is meant to create a template.
- Request idempotency keys.

## Decisions

### One store call checks, creates and links

Add to `RoomStore`:

```ts
/**
 * A temporary room's first save (ADR 0033): creates the template and links the room to it in one
 * step. When the room is already linked, creates nothing and returns the linked id; null when the
 * room is not one of this owner's temporary rooms.
 */
createEncounterForEditRoom(roomId: string, encounter: NewEncounterRecord, maxPerOwner: number):
  Promise<{ created: EncounterRecord } | { linkedTo: string } | null>;
```

and remove `setEditsEncounter`, which only this route uses.

- **Postgres:** one `$transaction`:
  1. `SELECT edits_encounter_id FROM rooms WHERE id = $room AND owner_gm_id = $gm AND temporary FOR UPDATE`. No row means null. A non-null link means `{ linkedTo }`.
  2. The existing per-owner advisory lock, count, and insert, shared with `createEncounter` through a private helper so the limit and the foreign-key-to-`EncounterMapMissingError` mapping stay in one place.
  3. `UPDATE rooms SET edits_encounter_id = $new WHERE id = $room`.

  The row lock makes a second save to the same room wait. When it then reads the row, the first transaction has committed and the link is set. An `EncounterLimitError` or map error rolls the whole transaction back, so nothing is created and nothing is linked.
- **Memory:** the check, the limit, the map check, the insert and the link all run with no `await` between them, the same guarantee `createEncounter` relies on today.

*Alternative: a per-room in-process lock in the route.* Smaller, but it only holds while there is one server process (ADR 0002 expects a Redis adapter for several), and a crash between create and link still orphans a template.

*Alternative: a conditional link (`UPDATE ... WHERE edits_encounter_id IS NULL`) after the insert, deleting the template when it matches no row.* That needs a compensating delete and leaves a window where the extra template exists. Locking first avoids both.

*Alternative: give each new-template room a template id up front and let the primary key reject the second insert.* That reuses a deleted template's id when a template is deleted mid-edit and saved again, and needs a migration.

### Lock order

Postgres takes the room row lock, then the owner's advisory lock. Nothing takes them the other way round: `createEncounter` takes only the advisory lock and never touches `rooms`. Deleting a template sets `edits_encounter_id` to null only on rooms linked to that template, and a room in this transaction has no link. Deleting the room waits for the row lock and then removes the room and its link. No deadlock cycle is possible.

### The losing save updates the template

On `{ linkedTo }` the route runs the same update path as a save to an already-linked room: find the template, check its map, and `updateEncounter` with this request's board. It answers 200 with the summary, as a later save does. Its `name` is ignored, as a name always is once the template exists. A double click sends the same name twice anyway.

To share that path, the route's update branch moves into a local helper used both for `session.editsEncounterId` and for `linkedTo`.

If the linked template is deleted between the store call and the update (`findEncounter` returns null), the link has been cleared by `ON DELETE SET NULL`. The route tries `createEncounterForEditRoom` once more, matching the existing rule that a template deleted while it was being edited saves as a new one. A second miss answers 404, like a room that is gone.

### Client guard

`EncounterEditBar` gets `const saving = useRef(false)`. `save()` returns false immediately when it is set, sets it before the request, and clears it in `finally`, alongside the existing `busy` state that still drives the disabled button. `leave()` and the Close prompt go through `save()`, so they get the guard too.

## Risks / Trade-offs

- [The room row lock is held while the template is inserted] → Only that room's other saves wait, for one insert. Other rooms and GMs are unaffected.
- [The memory store's atomicity depends on having no `await`] → A comment states it, and the store contract test runs both saves with `Promise.all`.
- [Postgres concurrency is only exercised when `DATABASE_URL` is set] → The contract test runs on Postgres in that mode. The tasks include running it there once.
- [A retried save with a different name keeps the first name] → Acceptable: the template exists and can be renamed from the library.

## Migration Plan

No schema or data migration. The change is server and client code only and can be deployed or rolled back on its own.
