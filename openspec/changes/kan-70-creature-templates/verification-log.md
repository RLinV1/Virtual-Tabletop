# KAN-70 verification — 2026-10-04

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