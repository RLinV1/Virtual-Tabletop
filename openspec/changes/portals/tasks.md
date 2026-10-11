## 1. Decision record

- [x] 1.1 Write `docs/adr/0026-portals.md` (visibility, commands, undo, activity log wording) marked as needing Real-Time Architecture owner review; verify it links ADR 0025 and this change

## 2. Shared contract

- [x] 2.1 Add `PortalKind`, `PortalState`, `Portal` and optional `Wall.portal` in `state.ts`; verify old wall fixtures still parse
- [x] 2.2 Add `portal.set` and `portal.setState` commands and the `PortalChanged` event; verify `npm run typecheck` flags every unhandled switch
- [x] 2.3 Add `portals.ts` with `blocksMovement` and `describePortalChange`; verify unit tests for each wording case
- [x] 2.4 Handle both commands in `decide` (authorization first, D4) and filter walls through `blocksMovement` for movement; verify decide unit tests for GM, player, locked, fogged and no-op cases
- [x] 2.5 Reduce `PortalChanged`; verify a reduce test sets and clears a portal
- [x] 2.6 Make `PortalChanged` reversible with a conflict check and undo phrase; verify undo unit tests
- [x] 2.7 Add activity log sentences; verify activity log unit tests
- [x] 2.8 Add `portalConcealedFrom` and extend both filters (D5); verify visibility unit tests for state, pass, redact and resync

## 3. Server

- [x] 3.1 Add a multi-client integration test: GM marks a door, player sees it, player opens it, a move through it then succeeds, a locked door refuses the player; verify with `npm test --workspace=@vtt/server -- -t "portal"`

## 4. Web

- [x] 4.1 Add the Portal mode to `WallCanvas` and the Kind and State pickers to `WallSetup`; verify by marking a door in the running app
- [x] 4.2 Draw portals for every viewer in `boardView.syncWalls`, with click and Shift-click toggling through a new `togglePortal` callback wired to `portal.setState`; verify GM and player toggling in the running app
- [x] 4.3 Add the `can.togglePortal` client hint; verify the player gets no hand cursor on a locked door

## 5. Verification

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 5.2 Drive the app with Playwright as GM and player and verify doors open, close, lock, and block movement as specified
