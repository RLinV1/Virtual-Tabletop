## 1. ADR

- [ ] 1.1 Write `docs/adr/0020-creature-templates.md` amending ADR 0012 for creature colour and conditions and `token.create`'s `conditions` and `count`; get Real-Time Architecture owner sign-off; verify ADR 0012 links to it

## 2. Shared contract

- [x] 2.1 Add `color` and `conditions` to `CreatureFields`, `CreateCreatureRequest` and `LibraryCreature`; add `conditions` and `count` to `token.create`; verify `npm run typecheck`
- [x] 2.2 Add a pure `spreadPositions` helper; verify unit tests: count 1 = origin; count 4 on an empty map fills origin and ring 1 in fixed order; occupied squares are skipped; map edges respected; size-2 tokens use 2-cell footprints
- [x] 2.3 Make `decide` emit `count` `TokenCreated` events with spread positions, sequential unique names and the given conditions; verify `packages/shared/test` cases (`describe("add several tokens (KAN-70)")`): names with and without an existing "Goblin", count 0 and 21 rejected, player forbidden, all copies hidden when hidden is set

## 3. Server

- [x] 3.1 Prisma migration adding `library_creatures.color` (nullable text) and `conditions` (text array, default empty); update both creature stores and routes; verify `apps/server/test/creatures.test.ts` gains cases for colour and conditions round trip, invalid colour, unknown condition, 13 conditions, and an old row reading back with defaults
- [x] 3.2 Integration test: the GM adds 3 hidden goblins in one command; the GM sees 3 tokens and players receive only redacted seqs; verify with `npm test --workspace=@vtt/server -- -t "KAN-70"`

## 4. Web

- [x] 4.1 Library creature form: colour picker and condition chips; verify `creatureDraft.test.ts` cases for the new fields
- [x] 4.2 Add Token: "From creature" fills colour and conditions; add a count field (1–20) sent as `count`; verify a `tokenEditor`/AddToken component test
- [x] 4.3 Token editor (GM only): Save as creature opens the creature form prefilled, with the image only when the token's asset is the GM's token art; verify a component test for the GM, a non-library image, and the player case (no control)
- [x] 4.4 Run `npm run lint && npm run typecheck && npm test`; verify all pass

## 5. Verification

- [x] 5.1 In Playwright as the GM at desktop and mobile widths: create a green "Goblin" with Prone; add 4 from creature onto a square and confirm 4 numbered green prone goblins on free squares; save an on-board token as a creature and confirm it appears in the library with the right values; in a player context confirm hidden copies never show; take screenshots

> Progress (2026-10-04): shared, server and web are built and tested (`addSeveral.test.ts`, creature API tests, `creatureDraft.test.ts`). Playwright script, GM signed in: a green "Goblin" with Prone saved in the library; Add token → From creature → How many 4 placed Goblin, Goblin 2, Goblin 3, Goblin 4, all green, Prone, 7/7 HP, AC 15, on neighbouring squares; Save as creature from Goblin 2 opened prefilled (name, colour, Prone) and saved "Goblin scout". A nested-form bug (the Save as creature form inside the token editor's form submitted the editor) was found and fixed. Migration 0008 applies cleanly after 0001–0007 on PGlite.
> Open: 1.1 (owner sign-off on ADR 0020); 3.1's run against a real Postgres (needs Docker; the memory store tests pass).
> 5.1 phone pass (390×844): Add token with How many 2 and Hidden fits with no horizontal scroll; Lurker and Lurker 2 placed; the player's browser received two redacted seqs and no frame mentioning "Lurker".

## 6. Starting HP and attack completion (2026-10-05)

- [x] 6.1 Preserve optional starting HP through creature schemas, both stores and API; add migration 0009 and ADR 0023.
- [x] 6.2 Expose Starting HP in the creature form; Save as creature preserves current HP and From creature copies it, including zero/negative HP. Old templates keep the full-health default.
- [x] 6.3 Verify HP validation, template edit/delete independence, player-safe batch placement, form prefill, and real Postgres persistence; run lint, typecheck, tests and build.
- [x] 6.4 Record the user's explicit authorization to implement saved attacks and merge after CodeRabbit review in ADR 0023; no separate review is claimed.
- [x] 6.5 Persist named attacks in the library, copy them to token.create, use copied attacks in the Attack panel, and include current browser edits in Save as creature.
- [x] 6.6 Withhold copied attacks from nonowners in snapshots/create/delete events; resync on ownership changes. Cover schemas, both stores, placement, independence, privacy and browser attack overrides in tests.
- [x] 6.7 Add Place all automatically for remaining copies as one command while keeping manual per-copy placement.
