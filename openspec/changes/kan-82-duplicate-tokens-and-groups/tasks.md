## 1. Contract (packages/shared)

- [x] 1.1 Add `TokenGroup`, `RoomState.groups` and `RoomState.tokenGroups` (zod defaults `{}`), caps `MAX_GROUPS = 30`, `MAX_GROUP_NAME = 40`; update `emptyRoomState`; verify `npm run typecheck` and that an old stored snapshot without the fields parses
- [x] 1.2 Add commands `token.duplicate`, `group.create`, `group.rename`, `group.delete`, `group.assign` and events `GroupCreated`, `GroupRenamed`, `GroupDeleted`, `TokensGrouped`, `InitiativeStartUndone`; verify typecheck
- [x] 1.3 Extract the `token.create` event builder into a helper and implement `token.duplicate` with it; verify tests in `test/tokenDuplicate.test.ts` (FR-REC-02): copied fields, placement next to the original, numbering, hidden copies, count bounds, player forbidden, hidden-as-missing
- [x] 1.4 Implement group commands in `decide` and events in `reduce`; verify tests in `test/tokenGroups.test.ts`: create/rename/delete, unique names, cap, at-most-one-group, empty group, delete keeps tokens, deleted token returns to its group on undo, player forbidden
- [x] 1.5 Undo: `inverseOf` returns `DomainEvent[]`; add `TokenCreated`, `GroupCreated`, `GroupRenamed`, `GroupDeleted`, `TokensGrouped`, `InitiativeStarted` to the reversible set with inverses, conflict checks and labels; verify undo tests for each, including refusals after a move, a rename, a reassignment, and an advance
- [x] 1.6 `InitiativeStartUndone` in `reduce` (turn order and saved scores); verify a test that start-then-undo returns initiative and token scores exactly to before
- [x] 1.7 Visibility: strip `groups`/`tokenGroups` for players, redact group events, resync `InitiativeStartUndone`; verify additions to `test/visibility.test.ts`
- [x] 1.8 Activity log sentences for the new events and the duplicate action; verify `test/activityLog.test.ts`

## 2. Server

- [x] 2.1 Integration test `apps/server/test/tokenGroups.test.ts` (FR-GM-16, FR-GM-21): GM creates groups with a hidden token in one; the player's snapshot, every event and a reconnect snapshot contain no group name or id; forged player `group.*` and `token.duplicate` are rejected; duplicate ×3 converges on all clients; undo of the duplicate converges

## 3. Web

- [x] 3.1 Add a pure `groupedTokens(state)` helper with unit tests in `apps/web/test` (order, Ungrouped, skips deleted tokens)
- [x] 3.2 Roster: grouped, collapsible sections; New group; per-row group picker; heading actions Rename, Delete, Hide all, Show all (Select all deferred: no board multi-select); verify a component test
- [x] 3.3 Duplicate with count in the token editor and roster row; verify a component test that it sends `token.duplicate` with the count
- [x] 3.4 Start encounter dialog: Include checkboxes; opening from groups pre-checks group and active-player tokens; only included scored tokens are sent; verify a component test
- [x] 3.5 CSS for group headings and controls at desktop and phone width

## 4. Docs and verification

- [x] 4.1 Write `docs/adr/0026-token-groups-and-duplicate.md` (state shape, events, reversible additions, `inverseOf` array, visibility); request Real-Time Architecture review
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 4.3 Verify with Playwright, GM and player tabs: duplicate ×3, create two groups, hide a group, start an encounter from both groups, undo the start, undo the duplicate; confirm the player tab never shows group names (snapshot text and DOM); take screenshots
