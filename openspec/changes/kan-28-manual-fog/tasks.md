## 1. Contract (packages/shared)

- [x] 1.1 Add `FogRegion`, `FogShape`, `MAX_FOG_REGIONS`, `RoomState.fog` and `pointInPolygon` / `polygonArea`; verify `emptyRoomState` initializes `fog` and typecheck passes
- [x] 1.2 Add `fog.add` / `fog.remove` commands and `FogAdded` / `FogRemoved` events; handle them in `decide` (GM only, area and cap checks) and `reduce`; verify with `test/fog.test.ts`
- [x] 1.3 Add `isInFog` / `concealedFrom` and make both filters fog-aware (tokens, templates, attack sides, initiative, token events, fog events); verify with visibility cases in `test/fog.test.ts`
- [x] 1.4 Make `FogAdded` / `FogRemoved` reversible (inverse, conflict check, label); verify undo cases in `test/fog.test.ts`
- [x] 1.5 Add activity log sentences; verify the formatter covers both events
- [x] 1.6 Write ADR 0016 and ask the Real-Time Architecture owner to review it

## 2. Server

- [x] 2.1 `relayEphemeral` drops drag previews of tokens concealed from the viewer, and previews into fog for non-owners
- [x] 2.2 Add `apps/server/test/fog.test.ts`: fog converges, a player can't add fog, a fogged token never appears in a player's raw traffic, revealing resyncs it in, undo restores a removed region

## 3. Web

- [x] 3.1 Draw `state.fog` in a fog layer between grid and tokens: opaque for players, semi-transparent with outline for the GM; verify in Playwright with a GM and a player
- [x] 3.2 Add the GM-only Fog tool (Rectangle, Polygon, Reveal) to the tool rail and its gestures in `boardView.ts`; verify in Playwright
- [x] 3.3 Mark FR-GM-17 built in `docs/DESIGN.md`

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
- [x] 4.2 Run the `sync-reviewer` and `visibility-auditor` agents and fix findings
