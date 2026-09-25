# Tasks

## 1. Contract helpers (packages/shared)

- [x] 1.1 In `decide.ts`, rename `normalizeDisplayName` to `normalizeName` and keep `normalizeDisplayName` as an exported alias (design D1). Verify that `npm run typecheck` passes and the existing `display name uniqueness (KAN-61)` tests still pass unchanged.
- [x] 1.2 Add and export `isTokenNameTaken(state, name, exceptId?)` and `uniqueTokenName(state, name)` (design D2, D5). Verify with unit tests in `packages/shared/test/decide.test.ts` under `describe("token name uniqueness (KAN-62)")`: "goblin", "Goblin " and "  GOBLIN" count as taken by "Goblin"; `exceptId` excludes that token; a free name is returned trimmed and unnumbered; "Goblin" becomes "Goblin 2", then "Goblin 3"; "goblin" becomes "goblin 2"; a taken "Goblin 2" becomes "Goblin 3"; a free "Goblin 7" is kept; a name of only digits, like "12", becomes "12 2"; a taken 60-character name gives a result of at most 60 characters ending in " 2".
- [x] 1.3 In the `token.create` case of `decide`, trim the name, reject a blank one with `invalid` (design D4), and put `uniqueTokenName(state, name)` in `TokenCreated.token.name`. Verify with unit tests: three creates of "Goblin" give "Goblin", "Goblin 2" and "Goblin 3"; deleting "Goblin 2" and creating "Goblin" gives "Goblin 2"; deleting "Goblin" and creating "Goblin" gives "Goblin"; a hidden "Goblin" makes a visible "Goblin" become "Goblin 2"; "  Goblin  " is stored as "Goblin"; "   " is rejected with no events; replaying the events with `reduce` gives the same names (spec: all requirements except the concurrency one).
- [x] 1.4 Run `npm run typecheck` and `npm test --workspace=@vtt/shared`. Confirm that no zod schema or event shape changed: `git diff main -- packages/shared/src/state.ts packages/shared/src/commands.ts packages/shared/src/events.ts packages/shared/src/protocol.ts` is empty.

## 2. Server (apps/server)

- [x] 2.1 Add `describe("unique token names (KAN-62)")` to `apps/server/test/sync.test.ts`. Cover: two `Promise.all` GM creates of "Goblin" are both acked, and the snapshot has exactly one "Goblin" and one "Goblin 2"; a player client receives the `TokenCreated` with the numbered name; a whitespace-only name gets a `rejected` reply and no event. No production server code should need to change. Verify with `npm test --workspace=@vtt/server -- -t "KAN-62"`.

## 3. Web (apps/web)

- [x] 3.1 Optional: in `AddToken.tsx`, add a one-line hint under the name field ("Duplicate names are numbered automatically, e.g. Goblin 2"). Verify in the running app (`server` + `web`): add "Goblin" twice and check that the roster shows "Goblin" and "Goblin 2", and that the activity log says "created Goblin 2".

## 4. Wrap-up

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm everything passes. Use a PR title that references KAN-62, and note in the PR that token rename is not part of this change (design D5).
