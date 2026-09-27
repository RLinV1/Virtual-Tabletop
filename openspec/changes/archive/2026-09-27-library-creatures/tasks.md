# Tasks

## 1. Contract and ADR

- [x] 1.1 Write `docs/adr/0012-library-creatures.md` covering: creatures as a separate resource, the null-on-delete image link, placement copying values, the `LibraryUsageResponse` change, and the board-name exception to ADR 0004. Verify it is linked from the ADR list or index if one exists, and flag it for review by the Real-Time Architecture owner in the PR description.
- [x] 1.2 In `packages/shared/src/protocol.ts`, add `CreatureFields`, `CreateCreatureRequest`, `UpdateCreatureRequest` and `LibraryCreature`, built from `Token.shape` and `TokenStats.shape`. Add `creatures: { id, name }[]` to `LibraryUsageResponse`. Unit tests in `packages/shared/test/creatures.test.ts` (`describe("... (FR-TAC-07)")`) cover each boundary (name 0/60/61, size 0/10/11, Max HP 0/1/9999/10000, AC -1/0/99/100), the size default, and rejection of an empty patch. Verify with `npm test --workspace=@vtt/shared`.

## 2. Storage

- [x] 2.1 Add the `LibraryCreature` Prisma model and migration `0004_library_creatures` (image link `onDelete: SetNull`, indexes on owner and image). Verify with `npx prisma validate` and that the migration SQL creates the table, foreign keys and indexes.
- [x] 2.2 Add creature methods to `LibraryStore` (`listCreatures`, `findCreature`, `createCreature`, `updateCreature`, `deleteCreature`, `creaturesUsingImage`), all scoped by owner. Implement them in `MemoryRoomStore`, where `deleteAsset` also clears `imageAssetId` on that GM's creatures. Verify with unit tests in `apps/server/test/libraryStore.test.ts`.
- [x] 2.3 Implement the same methods in `PostgresRoomStore`: `imageUrl` joined from the asset, and a foreign-key error (`P2003`) on image mapped to an "image not found" result. Add cases to `postgresStore.test.ts`, which is skipped without `DATABASE_URL`. Verify with `npm run typecheck`, and run the Postgres tests if a database is available.

## 3. Server routes

- [x] 3.1 Add `apps/server/src/http/creatures.ts` with GET/POST `/api/library/creatures` and PATCH/DELETE `/api/library/creatures/:id`, registered from `registerLibraryRoutes` behind `withGm`. Non-null `imageAssetId` must be the caller's own token art; otherwise return 400 "Image must be your own token art". Verify that `npm run typecheck` passes.
- [x] 3.2 Make `/api/library/:id/usage` return `creatures` from `creaturesUsingImage`. Verify that the existing usage tests still pass.
- [x] 3.3 Add integration tests in `apps/server/test/creatures.test.ts` (`describe("... (library-creatures, FR-TAC-07)")`):
  - create, list, edit and delete
  - validation rejections store nothing
  - 401 with a guest credential, 404 for another GM
  - the same 400 for another GM's art, a map and an unknown id
  - deleting art lists the creatures in `/usage` and then leaves them with `imageAssetId` and `imageUrl` null
  - no creature id appears in room state after placing from a creature's values

  Verify with `npm test --workspace=@vtt/server -- -t "creature"`.

## 4. Library page

- [x] 4.1 Rename the tabs to Maps · Token Art · Creatures. Change the empty-state text to "token art" and the upload button to "Upload token art". Verify in the browser, and check that the existing library tests still pass.
- [x] 4.2 Add `api.library.creatures` (list, create, update, remove) in `net/api.ts`, and `includeBuiltins` on `LibraryPicker` (default true). Verify that `npm run typecheck` passes and that the room's pickers still list built-ins.
- [x] 4.3 Build the Creatures tab: New creature, `CreatureCard` (art or colour disc, name, size, AC, HP), search, Edit, and Delete with a plain confirmation. Nothing loads without a GM token. Verify in the browser for each action, including that the tab is empty without an identity and makes no request.
- [x] 4.4 Build the creature form modal: Name, Size, Max HP, AC, and an image from owned token art only (Choose/Remove). It validates with the shared schema and shows server errors in the modal. Verify in the browser that invalid values block saving and that built-ins are not offered.
- [x] 4.5 Extend `AssetCard`'s delete confirmation to name creatures that use the art and say they will lose their image. Verify in the browser with art used by a room and by two creatures, and with art used only by creatures.

## 5. Add Token

- [x] 5.1 Add `creatureDraft(creature)` in `apps/web` (HP = Max HP; `imageUrl` and `assetId` from the creature). Unit tests in `apps/web/test/creatureDraft.test.ts` cover null Max HP, null image and a full creature.
- [x] 5.2 Add **From creature** to Add Token, shown when a GM token exists. A stacked modal with a searchable list fills in name, size, HP, Max HP, AC and image, and leaves rotation, Owner and Hidden alone. Verify in the browser that choosing "Goblin" fills the form, that values can still be edited, and that three placements give Goblin, Goblin 2 and Goblin 3 with the art and stats.

## 6. Acceptance

- [x] 6.1 In the browser, walk through every scenario in the three delta specs, including:
  - hidden placement with changed HP
  - editing a creature after placing leaves the placed token unchanged
  - deleting art leaves the creature as a colour disc and its next placement has no image
  - a player client sees the placed token's name and stats but no creature id

  Check narrow layouts at 390 and 320 px. Record the results in this file.
- [x] 6.2 Run `npm run lint && npm run typecheck && npm test` and `openspec validate library-creatures --strict`, and verify that all pass.

### QA record — 2026-09-27

**Postgres.** An embedded Postgres 18 (npm `embedded-postgres`, in the session scratchpad) ran on port 55432. `prisma migrate deploy` applied 0001–0004 cleanly, and `prisma migrate diff` against the schema reported no drift. With `DATABASE_URL` set, the server suite passed 130 tests with 1 skip. That includes the `LibraryStore` contract (18 cases on both stores), which covers owner scoping, the image link being cleared when art is deleted, and a foreign-key failure being mapped to `CreatureImageMissingError`. The store tests live in `libraryStore.test.ts`, which already runs one contract against both stores, rather than in `postgresStore.test.ts`.

**Browser, 31 checks passed.** Automated in headless Chromium (Playwright) against `npm run dev` with the in-memory store, using separate GM and player contexts.

- **Library tabs:** the tabs read Maps | Token Art | Creatures. The Token Art tab shows "Upload token art" and the five built-in portraits. The Creatures tab has an empty state and no built-ins section.
- **Creature form:** Max HP 0 disables Create and shows the Max HP hint. The image picker listed only the GM's own art ("Goblin art"), with no built-ins.
- **Creature cards:** Goblin shows "Size 1 · AC 15 · 7 HP" with its art. Rubble, saved with only a name, is a size-1 colour disc. Searching "gob" leaves 2 cards. Deleting Rubble after confirmation removes it.
- **Placing from Add Token:** From creature → Goblin filled in Name Goblin, Size 1, HP 7, Max HP 7, AC 15 and the art. Three placements produced Goblin, Goblin 2 and Goblin 3 at 7/7 HP and AC 15. A fourth, with Hidden ticked and HP changed to 4, appeared for the GM only as "hidden … 4/7 HP".
- **Player view:** the player saw exactly the three visible goblins with their stats. The player's WebSocket frames never contained a creature id or the art's library name.
- **Editing after placing:** after the creature's AC was changed to 17, all four placed goblins kept AC 15 after a reload, and the next From creature filled in AC 17.
- **Deleting the art:** the warning named the room "Crypt" and both creatures ("Used by 2 creatures: Goblin, Goblin Boss. They will lose their image."). After confirming, both creatures showed as colour discs, and From creature → Goblin Boss filled in size 2 with no image.
- **Narrow layouts:** at 390 and 320 px there was no horizontal scroll and all three tabs fit. The image row wraps at 320 px (this was fixed during QA).
- **No GM identity:** the Creatures tab is empty and makes no `/api/library` requests, and the form points the GM to the Token Art tab.
- **No page errors.**

`npm run lint`, `npm run typecheck` and `npm test` pass (web 185, shared 123, server 130 plus 1 skip with Postgres). `openspec validate library-creatures --strict` passes.
