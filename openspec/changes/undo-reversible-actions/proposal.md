## Why

A GM who drags the wrong token, reveals a hidden monster too early, clears the wrong condition, rules a miss as a hit, or applies damage to the wrong target has no way back (KAN-41, FR-REC-02). They must rebuild the change by hand from memory, mid-session, while players wait. Every event already carries the value it replaced (invariant 6), so the data for undo exists. What is missing is the command, the grouping of events into one action, and the UI.

## What Changes

- **Undo lives in the activity log.** Each recent undoable action in the GM's activity log gets its own Undo button, named for what it undoes ("Undo move Goblin"). The GM picks the exact action, so they always know what they are undoing. It does not have to be the most recent one. An undone entry is marked Undone. There is no top-bar Undo button and no keyboard shortcut. Players get no undo control, and the server refuses the command from them.
- **Reversible set:** token move, token hide/reveal, token condition changes, hit/miss rulings on attack rolls, and applying a damage roll (HP back and the roll no longer Applied, as one unit). A `token.configure` save is undoable when every event it produced is in that set. HP and AC edits on their own are not undoable, because the GM just edits them again. Dice rolls are not undoable, so a result can't be rerolled away.
- **Undo is a compensating event (FR-REC-03).** Undoing appends the inverse of each of the action's events, in reverse order, followed by one new `ActionUndone` event. The inverse of applied damage is a new `RollDamageUnapplied` event. Nothing is deleted or rewritten. The activity log shows the original action, the undo, and the restoring events as separate entries.
- **One action = one command.** The server tags every committed event with the id of the command that produced it (`commandId`), so undo always reverses a whole command as a unit. A token editor save that moved and hid a token is one undo, not two.
- **Refuse, never clobber.** Undo only proceeds when the current state still matches what the action set, for every event in it. Otherwise the server refuses with a message naming the token or roll that has changed since, and nothing is appended.
- **Bounded history.** Room state keeps the 20 most recent undoable actions. Older ones can no longer be undone.
- **BREAKING (contract):** `CommittedEvent` gains an optional `commandId`. `DomainEvent` gains `ActionUndone` and `RollDamageUnapplied`. `Command` gains `history.undo { commandId }`. `RoomState` gains an undo history, and `reduce` takes optional event metadata. The Postgres `events` table gains a nullable `command_id` column. Events written before this change have no `commandId` and are each treated as their own action. New ADR 0013 records these decisions.

## Non-goals

- Named checkpoints (save and restore). The ticket lists them as the universal fallback. They get their own OpenSpec change.
- Redo.
- Undo for anything outside the reversible set above: token create, delete, appearance, HP/AC edits on their own, image, owners, maps, grid, templates, initiative, dice rolls, participants.
- Undo by players.

## Capabilities

### New Capabilities
- `room-undo`: the GM picks a recent action from the activity log and reverses it. Covers who may undo, which actions are reversible, how actions are grouped, the conflict refusal, the history bound, visibility to players, and the Undo buttons in the activity log.

### Modified Capabilities
- `room-activity-log`: the "every supported event has a sentence" requirement gains sentences for `ActionUndone` and `RollDamageUnapplied`.

## Impact

- **packages/shared:** `CommittedEvent.commandId`, the `ActionUndone` and `RollDamageUnapplied` events, the `history.undo` command, `RoomState.undo`, `reduce(state, event, meta?)` and `reduceCommitted`, a new `undo.ts` (reversible set, inverses, conflict check, labels), `decide` handling, filters in `visibility.ts` (history and `commandId` stripped for players, `ActionUndone` redacted, `RollDamageUnapplied` filtered like `RollDamageApplied`), and activity-log sentences. Schema change, so ADR 0013 plus review by the Real-Time Architecture owner.
- **apps/server:** `LiveRoom.commit` assigns one `commandId` per committed batch and reduces with it. Both stores persist and return it. Prisma migration `0005_event_command_id` adds a nullable `command_id` column. Room load replays with the stored ids.
- **apps/web:** `RoomConnection` reduces GM events with their `commandId`. The activity log shows Undo buttons, the Undone mark, and refusal messages, and sends `history.undo` through `RoomConnection.command`.
- **docs:** `docs/adr/0013-undo.md`, which closes ADR 0011's open note on undoing applied damage.
- **Tests:** shared unit tests for grouping, inverse events, picking an older action, combat undo, conflict refusal, the history bound and filters. A server integration test covering GM undo broadcast to every client, player refusal, a refused undo appending nothing, hidden tokens staying hidden, and history surviving a room reload. A Playwright check of undo from the activity log.
