# KAN-70 verification — 2026-10-04

## Completion verification — 2026-10-05

- Current main already includes the original colour, conditions, Save as creature and count work (PR 73). Jira was still To Do.
- Added starting HP and named attacks; added automatic batch placement while keeping manual per-copy placement.
- Applied all ten migrations to an isolated PostgreSQL 16 database. Real Postgres store tests now passed, including legacy defaults and starting HP/attack round trips.
- `npm test`: 1,156 passed (399 shared, 314 server, 441 web, 2 benchmark); one intentional store test skipped. Benchmark p95 130.8 / 133.1 ms, below 150 ms.
- Final `npm run lint`, `npm run typecheck`, `npm run build`: passed. After the final UI adjustments, all 15 targeted creature/placement web tests passed.
- Browser retest: created a fresh local test account and Wounded Ogre at 30/59 HP, AC 11, with Greatclub (1d20+6 to hit / 2d8+4 damage). From creature showed the saved values; Place all automatically placed Wounded Ogre and Wounded Ogre 2 together at 30/59 HP and cleared the placement draft. The Attack panel showed Greatclub with the saved rolls. Save as creature prefilled current HP and Greatclub, saved Saved Ogre, and both templates retained 30/59 HP and one attack after reloading the library.
- ADR 0023 records explicit implementation/merge authorization separately from formal architecture review. It remains proposed because no separate review or sign-off is recorded. ADR 0020's historical sign-off entry remains unchanged.

## Review fixes

- Bound batch placement to 20 rings / 1,680 perimeter candidates regardless of map dimensions or token size, with deterministic origin fallback. Regression tests cover a schema-valid tiny off-map token, an occupied search area, and perimeter traversal order.
- Handle colour picker input events immediately so the displayed colour is the colour saved. Add Token allows changing the creature colour before placement.

## Automated verification

- `npm run lint`: passed.
- `npm run typecheck`: passed, including rerun after UI changes.
- `npm test`: 1,073 passed (390 shared, 273 server, 408 web, 2 benchmark); 22 Postgres cases skipped because DATABASE_URL is unset.
- Ephemeral benchmark p95: 125.3 ms GM / 125.5 ms second player (150 ms limit).
- `npm run build`: passed.

## Browser verification

Started `npm run dev` with memory persistence and local uploads. Used Playwright locators through the Codex in-app browser MCP. A standalone Playwright MCP server is not exposed in this session.

- Created a disposable local GM account, a 7 HP / AC 15 / Prone creature, and a room.
- Reproduced colour input displaying green but saving red; after the input-event fix the saved disc rendered rgb(46, 125, 50).
- Added four copies from the creature: names numbered automatically, separate neighbouring positions, full HP and Prone carried over. Repeated with the saved green creature and verified green discs.
- Save as creature prefilled token name, size, Max HP, AC and Prone; saved to the library without submitting/changing the token editor.
- At 390 x 844, Add Token count/colour/hidden controls were usable with no horizontal overflow (document scrollWidth equalled clientWidth).
- Created two hidden copies on mobile. Joined through 127.0.0.1 as a separate player; eight visible goblins appeared, zero Hidden Lurker matches, no Save as creature control, and no browser console errors.

## Remaining integration checks

- Real PostgreSQL migration/store tests require a configured database.
- ADR 0020 still awaits the architecture owner's explicit sign-off; no approval was fabricated.
