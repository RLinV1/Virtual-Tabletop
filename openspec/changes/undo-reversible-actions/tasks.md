## 1. ADR and contract (packages/shared)

- [x] 1.1 Write `docs/adr/0013-undo.md` covering design D1–D5, the reversible-set widening recipe and the rollback note, and verify it states the pick-from-log semantics and the combat set (the `docs/DESIGN.md` table lists only ADRs 0001–0003, so it is not extended)
- [x] 1.2 Add optional `commandId` to `CommittedEvent`, and `ActionUndone { commandId }` and `RollDamageUnapplied { rollId, amount }` to `DomainEvent`; verify `npm run typecheck` flags only the expected exhaustiveness gaps
- [x] 1.3 Add `history.undo { commandId }` (strict) to `Command`; verify a parse test accepts it with a `commandId` and rejects it without one or with extra fields
- [x] 1.4 Add `RoomState.undo` (empty in `emptyRoomState`) and a new `undo.ts` with `UndoEntry`, `REVERSIBLE_EVENT_TYPES`, `UNDO_HISTORY_LIMIT` (20) and `eventMeta`; verify typecheck passes

## 2. Reduce: history (packages/shared)

- [x] 2.1 Add the optional `meta` argument to `reduce` and `reduceCommitted` with the `seq:<seq>` fallback, recording history as in design D2; verify in `packages/shared/test/undo.test.ts` that a reversible command makes one entry, a multi-event `token.configure` makes one entry, and a mixed batch is not undoable (FR-REC-02)
- [x] 2.2 Trim to 20 undoable entries and drop a closed entry that can't be undone; verify 25 moves keep the 20 newest and a dice roll between two moves leaves both undoable
- [x] 2.3 Handle `ActionUndone` and `RollDamageUnapplied` in `reduce`; verify undoing steps through actions, leaves no entry for the undo itself, and clears a roll's Applied mark
- [x] 2.4 Verify `reduce` without `meta` leaves `undo` untouched and that legacy events without `commandId` make one entry per reversible event
- [x] 2.5 Decide undoability per whole action (`canUndo`): a `TokenStatsSet` is undoable only beside a `RollDamageApplied`; verify a manual HP edit is never offered

## 3. Decide: undo (packages/shared)

- [x] 3.1 Handle `history.undo` in `decide`: GM-only (`forbidden` otherwise), and "That action can no longer be undone." for an unknown, undone, trimmed or non-undoable `commandId`; verify with unit tests
- [x] 3.2 Emit inverse events in reverse order plus `ActionUndone` for moves, hide/reveal, conditions, rulings and applied damage; verify each restores the previous value, a configure save of move + hide is undone as one decision in the safe order, an older action can be undone while newer ones stay, and an undone Apply restores HP, clears Applied and can be applied again (FR-REC-03)
- [x] 3.3 Add the conflict check for tokens (missing, position, hidden, conditions as a set, stats) and rolls (left the window, ruling changed, no longer Applied) with messages naming the token or roll; verify with unit tests for a deleted token, a token moved again, a changed ruling, HP edited after an Apply, and reordered but equal conditions (allowed)

## 4. Visibility and activity log (packages/shared)

- [x] 4.1 In `visibility.ts`, give players `undo: []`, always redact `ActionUndone`, filter `RollDamageUnapplied` like `RollDamageApplied`, and strip `commandId` from events sent to players; verify in `undo.test.ts` that undoing a hidden token's move sends players only redacted seqs, undoing a reveal removes the token for players, and taking back a GM-only damage roll is redacted
- [x] 4.2 Add `describeUndo` phrases and the `ActionUndone` and `RollDamageUnapplied` sentences in `formatActivity`; verify the log reads "Raymond undid the move of Goblin" and "Mara took back 7 damage from an earlier roll"
- [x] 4.3 Switch the activity log replay to `reduceCommitted` and verify the existing activity log tests still pass

## 5. Server (apps/server)

- [x] 5.1 Add Prisma migration `0005_event_command_id` and map `command_id` in the Postgres store's `append` and `loadEvents`; add a round-trip test to `postgresStore.test.ts` (skipped without `DATABASE_URL`; not run locally because Docker was down)
- [x] 5.2 Add `commandId` to `NewEvent` and keep it in the memory store; verify a round-trip test passes
- [x] 5.3 In `LiveRoom.commit`, assign one `randomUUID` per batch and reduce with `reduceCommitted`; use it in `LiveRoom` load too; verify typecheck and the existing server suites pass (clients are compared with their filtered view via `viewFor`)
- [x] 5.4 Add `apps/server/test/undo.test.ts` (FR-REC-02): the GM undoes a player's move and every client converges, players never see `commandId`, a player's undo is forbidden, a refused undo appends nothing, a hidden token stays hidden, and history survives a room reload

## 6. Web (apps/web)

- [x] 6.1 Reduce GM events that carry `commandId` with `reduceCommitted` in `RoomConnection`; verify the GM client's `state.undo` matches the server's (server test 5.4 mirrors the browser client)
- [x] 6.2 Show an Undo button on the newest entry of each undoable action in the activity log, labelled from `describeUndo`, mark undone actions Undone, show refusals on the entry, and refresh after an undo; verify with lint, typecheck and the Playwright run in 7.2
- [x] 6.3 Offer no top-bar Undo and no keyboard shortcut; verify the top bar has no undo control in the Playwright run

## 7. Verification

- [x] 7.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass (lint limited to `packages` and `apps`: the root run also lints `.claude/worktrees`, fixed separately on `chore/eslint-ignore-worktrees`)
- [x] 7.2 With the dev servers, use the Playwright MCP as GM and player: moves show Undo in the activity log; an older move whose token moved again is refused with its message; undoing marks the entry Undone; the top bar has no Undo. A player tab has no undo control, never receives the hidden Orc, `commandId` or `ActionUndone` over the socket, gets Orc on reveal and loses it when the reveal is undone. In combat, only the Apply and the ruling offer Undo (not the manual HP edit or the rolls); undoing the Apply restores 15/15 HP and re-offers Apply, and undoing the ruling returns the roll to pending
- [x] 7.3 Run the `sync-reviewer` and `visibility-auditor` agents on the branch diff. No invariant violations or leaks. Fixed what the sync review found: legacy events are never undoable (an old Apply could be half undone), and the history is trimmed only between batches (an undo evicted an unrelated action). Added tests for combat undo against hidden targets and GM-only rolls, and a full-state convergence check after an undo
