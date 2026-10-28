# Tasks

## 1. ADR and review

- [x] 1.1 Write `docs/adr/0044-area-effects-and-group-rolls.md`. It covers the new schemas, `rolls` becoming a union, the undo choice, the filtering rules, and how this amends ADR 0039. Done when the file exists and ADR 0039 links forward to it.
- [ ] 1.2 Request review from the Real-Time Architecture owner. Done when the ADR status records the review outcome before the shared schema tasks merge.

## 2. Shared contract: group rolls

- [x] 2.1 Add `GroupRollEntry` and `GroupRoll` (`kind: "group"`) to `dice.ts`, and make `RoomState.rolls` `(DiceRoll | GroupRoll)[]`. Done when `npm run typecheck` passes after every reader of `rolls` narrows on `kind`, and a test shows a pre-change snapshot still parses.
- [x] 2.2 Add the `dice.rollGroup` command and the `GroupRolled` event. In `decide`: GM only; 1–30 distinct existing tokens; a valid expression; each token rolled with `ctx.random`. Done when unit tests in `packages/shared/test` cover a successful roll, forbidden, empty, duplicate, over 30, not found, and a bad expression.
- [x] 2.3 Reduce `GroupRolled` into `rolls` with the `ROLL_LOG_LIMIT` cap. Done when a reducer test shows one log entry per group roll and the cap is enforced.
- [x] 2.4 Filter group rolls for players in `filterStateForViewer` and `filterEventForViewer`: GM-only is redacted, and concealed entries are dropped. Done when visibility tests cover a hidden token, a fogged token and a GM-only roll.

## 3. Shared contract: Area Effect

- [x] 3.1 Add the `AreaEffect` schema and `RoomState.areaEffect` (default `null`), plus a helper that derives the stage. Done when the schema test parses a state that has no `areaEffect` field.
- [x] 3.2 Add `areaEffect.start` → `AreaEffectStarted`. It is GM only, needs attacks on, allows one open effect, and validates like a group roll. Done when unit tests cover success, forbidden, already open, attacks off, and the group-roll refusals.
- [x] 3.3 Add `areaEffect.call` → `AreaEffectCalled { previous }`. It handles the first call, a reassignment and a takeover, refuses when no call is pending or the call goes to the same participant, and returns not found for an unknown participant. Done when unit tests cover each case, including a call after the damage roll.
- [x] 3.4 Add `areaEffect.rollDamage` → `AreaEffectDamageRolled`. Only the holder of the call may send it, it handles the `single` and `perTarget` modes, and it skips deleted targets. Done when tests cover both modes, another participant sending it (forbidden), an already answered call, and a bad expression.
- [x] 3.5 Add `areaEffect.resolve`. It emits `TokenStatsSet` (the floor at `MIN_HP`, the heal cap at `maxHp`, healing never lowers HP), additive `TokenConditionsSet` (12 max, preset-gated), and `AreaEffectResolved { effect, amounts }`. Done when tests cover Half-style amounts, healing, tokens without HP, deleted targets, a non-target token, too many conditions, conditions off, a pending call, and a double resolve.
- [x] 3.6 Add `areaEffect.close` → `AreaEffectClosed { effect }`. Done when tests show it changes no tokens and is refused when nothing is open or a player sends it.
- [x] 3.7 Make `AreaEffectResolved` reversible, with the inverse `AreaEffectResolveUndone`, plus `undoConflict` and `describeUndo`. Done when an undo test restores HP and conditions in one action, refuses after a later HP edit, and leaves `areaEffect` closed.
- [x] 3.8 Add one projection, `areaEffectForViewer`, used by both filters. Players get no saves, no concealed targets, and a closing event that carries only its id. Done when visibility tests check that the player-facing payloads contain no hidden token id, save total or hidden damage.
- [x] 3.9 Add activity-log phrases for every new event. Done when the activity log test shows a label for each one.

## 4. Server integration

- [x] 4.1 Add a multi-client integration test in `apps/server/test` for the full flow (FR-TAC-06, FR-TAC-09): the GM starts the effect, calls player A, reassigns the call to player B, B rolls per target, and the GM resolves. Done when it passes and A's prompt state clears on the reassignment.
- [x] 4.2 Add an integration test showing that a hidden target never reaches any player through live events, a reconnect snapshot or the resolve batch (FR-GM-23). Done when it passes.
- [x] 4.3 Add an integration test for the race: B's damage roll and the GM's takeover are sent at the same time, and exactly one is accepted. Done when it passes reliably over repeated runs.

## 5. Board selection (`apps/web/src/board`)

- [x] 5.1 Add `tokensTouchingArea(geometry, tokens, grid)` next to `areaShape()`, covering footprint overlap for the circle, cone, box and line shapes, where touching only at an edge or corner doesn't count. Done when unit tests cover each shape, a Large token clipped at the edge, and edge-only contact.
- [x] 5.2 Add GM multi-select: a shift-click on a token toggles it in the selection, and selected tokens are marked. Done when, by hand, shift-click toggles, a plain click still selects one token and dragging still works, and players get no multi-select.
- [x] 5.3 Add a template-pick mode (crosshair cursor; Esc or right-click cancels) that replaces the selection with the tokens touching the template. Done when, by hand, picking a placed circle selects the expected tokens, hidden ones included for the GM.

## 6. Panels (`apps/web/src/panels`)

- [x] 6.1 Add a shared selection list component that shows the selected tokens, with remove buttons and a From template button. Done when it is used by both 6.2 and 6.3.
- [x] 6.2 Add Group roll to `DicePanel` (GM only): the selection, a formula, a label and the visibility choice, with Roll disabled when nothing is selected. Make the roll log render group entries. Done when, by hand, a public group roll shows per-token totals and players see only the visible tokens.
- [x] 6.3 Add `AreaEffectPanel` to the Play tab (GM only, inside `features.attacks`), with controls for each stage: start, call (caller pre-filled from the active initiative token's owner, falling back to the GM), reassign/take over, roll damage when the GM holds the call, resolve rows (amount field, Half/None, conditions for all and per row) and Skip. Done when, by hand, the whole flow works end to end.
- [x] 6.4 Add `DamageCallPrompt` for the called participant: the label, the visible target count, a formula, single or per target, and Roll; plus a Play tab badge while a prompt is pending. Done when, by hand, the prompt survives a reload and disappears on reassignment or Skip.
- [x] 6.5 Extend `pendingRulings` in `attackRoll.ts` with the open Area Effect, and add its row to `RulingsPanel` with the stage controls. Done when, by hand, the Play badge and "N rulings pending" count the effect while it waits on a player, and a unit test covers `pendingRulings`.

## 7. Finish

- [x] 7.1 Run the `sync-reviewer` and `visibility-auditor` agents on the diff and address their findings. Done when both report no open issues.
- [x] 7.2 Run `npm run lint && npm run typecheck && npm test`. Done when all three pass.
- [x] 7.3 Check that `openspec validate area-effects --strict` passes.
