Implementation note: the user asked for this change to be implemented with Sonnet 5.5 subagents. Groups 2–3 must land before 4–6; groups 4, 5 and 6 can then run in parallel.

## 1. ADR

- [x] 1.1 Write `docs/adr/0044-line-of-sight.md` recording design decisions 1–6 (extends ADR 0016, 0029, 0030) and verify it names the Real-Time Architecture owner as reviewer
- [ ] 1.2 Get ADR 0044 reviewed by the Real-Time Architecture owner and set its status to Accepted

## 2. Sight geometry (packages/shared)

- [x] 2.1 Add `packages/shared/src/sight.ts` with `sightPolygon(segments, origin, bounds)` and the blocking-segment selection (plain walls, closed/locked doors; never windows or open doors), and verify with unit tests in `packages/shared/test/sight.test.ts` covering an open room, a single wall, a corner, collinear walls, a T-junction, an open door, a closed door, a window and an origin on the map edge (FR-GM-19)
- [x] 2.2 Add `viewerSight(state, viewer)` and the in-sight test with the 1-pixel edge tolerance, and verify unit tests for: GM gets `null`, line of sight off gets `null`, no owned token gets `[]`, a hidden owned token gives no polygon, two owned tokens give two polygons, no map gives `[]`
- [x] 2.3 Add a timing test: 1500 random walls and one origin computes in under 5 ms, and verify it passes in `npm test --workspace=@vtt/shared`

## 3. Room flag, command and event (packages/shared)

- [x] 3.1 Add optional `lineOfSight` to `Scene`, command `scene.setLineOfSight { enabled }`, event `LineOfSightSet { from, to }` and its activity-log line ("<GM> turned line of sight on/off"), and verify schema tests parse old scenes without the field
- [x] 3.2 Handle the command in `decide` (GM only, `forbidden` for players, `invalid` for a no-op) and the event in `reduce`, and verify unit tests for each case
- [x] 3.3 Make `LineOfSightSet` undoable through the existing undo path and verify an undo test turns it back off

## 4. Concealment and filters (packages/shared)

- [x] 4.1 Introduce `Concealment` and `concealmentFor(state, viewer)`; change `concealedFrom`, `templateConcealedFrom` and `portalConcealedFrom` to take it, update every caller (filters, `decide` portal check, server relay), and verify `npm run typecheck` passes with existing tests unchanged in outcome
- [x] 4.2 Add optional `sight` to `RoomState`, set it in `filterStateForViewer` for players when line of sight is on, and verify visibility tests: token behind a wall withheld, owned token always kept, token in sight but under fog withheld, portal outside sight withheld, portal on the sight edge kept, other player's template outside sight withheld, turn order and attack sides blank an out-of-sight token, GM state has no `sight`
- [x] 4.3 Extend `filterEventForViewer` with the resync rules in design decision 5, and verify tests for each listed event type, plus a non-owned `TokenMoved` into and out of sight resyncing and one staying out of sight being redacted

## 5. Server (apps/server)

- [x] 5.1 Use per-recipient `Concealment` in `relayEphemeral` with a cache cleared on each committed event, and verify an ephemeral test: a GM drag preview of a token behind a wall reaches no player; one inside sight does
- [x] 5.2 Add `apps/server/test/lineOfSight.test.ts` (FR-GM-19) with two sockets: with line of sight on, a goblin behind a wall never appears in the player's welcome, events or previews; opening the door delivers it; turning line of sight off delivers it; verify with `npm test --workspace=@vtt/server -- -t "line of sight"`
- [x] 5.3 Run `npm run test:bench --workspace=@vtt/server` and verify the ephemeral latency benchmark still passes

## 6. Web (apps/web)

- [x] 6.1 Draw the inverse sight mask in `board/boardView.ts` when `state.sight` is present (opaque over map and grid, cut out by the polygons, under the fog clouds and UI), and verify the GM's normal view draws no mask
- [x] 6.2 Add a GM-only "Line of sight" toggle to the board tool rail that sends `scene.setLineOfSight` through `RoomConnection.command`, hidden from players and inert while viewing as a player, and verify players' rails have no such control
- [x] 6.3 Verify with the Playwright MCP (done in the app's built-in browser; the Playwright MCP server failed to connect): GM and player in two tabs on a walled map; turning line of sight on darkens the player's board outside their token's room, hides a goblin behind a wall, and opening the door reveals it; view-as-player shows the same; take screenshots

## 7. Done check

- [x] 7.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass (UVTT upload timeouts in libraryUvtt/uvttExport/uvttImport also fail on clean main; not caused by this change)
- [ ] 7.2 Run the `visibility-auditor` and `sync-reviewer` agents on the diff and verify no unresolved findings
