## 1. ADR

- [ ] 1.1 Write `docs/adr/0020-creature-templates.md` amending ADR 0012 for creature colour and conditions and `token.create`'s `conditions` and `count`; get Real-Time Architecture owner sign-off; verify ADR 0012 links to it

## 2. Shared contract

- [x] 2.1 Add `color` and `conditions` to `CreatureFields`, `CreateCreatureRequest` and `LibraryCreature`; add `conditions` and `count` to `token.create`; verify `npm run typecheck`
- [x] 2.2 Add a pure `spreadPositions` helper; verify unit tests: count 1 = origin; count 4 on an empty map fills origin and ring 1 in fixed order; occupied squares are skipped; map edges respected; size-2 tokens use 2-cell footprints
- [x] 2.3 Make `decide` emit `count` `TokenCreated` events with spread positions, sequential unique names and the given conditions; verify `packages/shared/test` cases (`describe("add several tokens (KAN-70)")`): names with and without an existing "Goblin", count 0 and 21 rejected, player forbidden, all copies hidden when hidden is set

## 3. Server

- [ ] 3.1 Prisma migration adding `library_creatures.color` (nullable text) and `conditions` (text array, default empty); update both creature stores and routes; verify `apps/server/test/creatures.test.ts` gains cases for colour and conditions round trip, invalid colour, unknown condition, 13 conditions, and an old row reading back with defaults
- [x] 3.2 Integration test: the GM adds 3 hidden goblins in one command; the GM sees 3 tokens and players receive only redacted seqs; verify with `npm test --workspace=@vtt/server -- -t "KAN-70"`

## 4. Web

- [x] 4.1 Library creature form: colour picker and condition chips; verify `creatureDraft.test.ts` cases for the new fields
- [x] 4.2 Add Token: "From creature" fills colour and conditions; add a count field (1–20) sent as `count`; verify a `tokenEditor`/AddToken component test
- [x] 4.3 Token editor (GM only): Save as creature opens the creature form prefilled, with the image only when the token's asset is the GM's token art; verify a component test for the GM, a non-library image, and the player case (no control)
- [x] 4.4 Run `npm run lint && npm run typecheck && npm test`; verify all pass

## 5. Verification

- [x] 5.1 In Playwright as the GM at desktop and mobile widths: create a green "Goblin" with Prone; add 4 from creature onto a square and confirm 4 numbered green prone goblins on free squares; save an on-board token as a creature and confirm it appears in the library with the right values; in a player context confirm hidden copies never show; take screenshots

> Progress (2026-10-04): shared, server and web are built and tested (`addSeveral.test.ts`, creature API tests, `creatureDraft.test.ts`). Playwright script, GM signed in: a green "Goblin" with Prone saved in the library; Add token → From creature → How many 4 placed Goblin, Goblin 2, Goblin 3, Goblin 4, all green, Prone, 7/7 HP, AC 15, on neighbouring squares; Save as creature from Goblin 2 opened prefilled (name, colour, Prone) and saved "Goblin scout". A nested-form bug (the Save as creature form inside the token editor's form submitted the editor) was found and fixed. Migration 0008 applies cleanly after 0001–0007 on PGlite.
> Open: 1.1 (owner sign-off on ADR 0020) and 3.1's run against a real Postgres (needs Docker; the memory store tests pass).
