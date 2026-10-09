## 1. Contract

- [x] 1.1 Write `docs/adr/0022-token-initiative-memory.md` (review by the Real-Time Architecture owner still needed)
- [x] 1.2 Add `initiative` (nullable, default null) to `Token` in `packages/shared/src/state.ts`
- [x] 1.3 Add optional `scores` (tokenId, score, previous) to `InitiativeStarted` in `events.ts`, defaulting to `[]`

## 2. Decide, reduce, visibility

- [x] 2.1 `decide` for `initiative.start` emits scores with each token's current `initiative` as `previous`
- [x] 2.2 `reduce` applies scores to tokens on `InitiativeStarted`
- [x] 2.3 (Dropped: initiative events are not part of undo today; `previous` is recorded in the event)
- [x] 2.4 Confirm `filterStateForViewer` and `filterEventForViewer` keep hidden tokens' scores private; add to `visibility.test.ts`
- [x] 2.5 Unit tests in `packages/shared/test`: save, replace, token left out, old event without `scores`

## 3. Server

- [x] 3.1 Integration test in `apps/server/test`: scores persist after the encounter ends and after a reconnect
- [x] 3.2 Check memory and Postgres stores round-trip events with and without `scores`

## 4. Web

- [x] 4.1 `InitiativeTracker` pre-fills each field from `token.initiative` when the popup opens
- [x] 4.2 A cleared field is omitted from the entries; the token keeps its saved score
- [x] 4.3 Test the pre-fill and the omitted-blank behaviour

## 5. Verify

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`
- [ ] 5.2 Playwright: start an encounter, end it, reopen Start encounter and see the saved scores; edit one and confirm it replaces (not run: needs a signed-in GM room)
