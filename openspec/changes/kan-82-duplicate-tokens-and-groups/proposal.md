## Why

Running a session still costs the GM too many clicks (Jira KAN-82). A second goblin means filling in Add token again, even when an identical one is on the board. And a map often holds several groups of enemies, of which usually only one is fighting; starting initiative means picking every combatant by hand each time and remembering who goes together.

## What Changes

- **Duplicate a token.** GM only, from the token editor and the roster: "Duplicate" and "Duplicate ×N" (1–20). Copies keep image, size, rotation, colour, stats, conditions, named attacks, owners and hidden state, are placed on the nearest free squares next to the original, and are numbered by the existing unique-name rule ("Goblin" → "Goblin 2"). One action, so one undo.
- **Token creation becomes undoable.** Undo of a create (single, ×N or duplicate) deletes the created tokens, refused if any of them changed since.
- **Token groups.** The GM can create, rename and delete named groups ("Gate guards") in a room and assign tokens to them. A token is in at most one group; a group may be empty. Deleting a group never deletes its tokens. Each change is one undoable action.
- **Groups in the roster.** The GM's roster shows tokens under their group headings (collapsible), with "Select all", "Hide all" / "Show all" per group (reusing token visibility, FR-GM-16) and an "Ungrouped" section.
- **Start encounter from groups.** The GM picks one or more groups; the Start encounter dialog opens with those groups' tokens plus player-owned tokens included, and the GM can add or remove tokens before starting.
- **Starting initiative becomes undoable**, so an encounter started from the wrong group is one click to take back.
- **Groups are GM-only.** Players never receive group names, ids or membership, in snapshots, events or REST.
- **Schema changes:** new commands `token.duplicate`, `group.create`, `group.rename`, `group.delete`, `group.assign`; new events `GroupCreated`, `GroupRenamed`, `GroupDeleted`, `TokensGrouped`, `InitiativeStartUndone`; `RoomState` gains `groups` and `tokenGroups`; `TokenCreated` and `InitiativeStarted` join the undoable set. Needs ADR and Real-Time Architecture review.

## Capabilities

### New Capabilities
- `token-duplication`: duplicating a token one or many times, what is copied, placement and naming, authorization, undo; also undo of token creation in general.
- `token-groups`: GM-only named groups of tokens within a room, membership rules, roster presentation, starting an encounter from groups, undo of group changes and of starting initiative, and their visibility to players.

### Modified Capabilities

## Impact

- `packages/shared`: `commands.ts`, `events.ts`, `state.ts` (`TokenGroup`, `groups`, `tokenGroups`, empty defaults), `decide.ts`, `reducer.ts`, `undo.ts` (new reversible types, inverses, conflicts, labels), `visibility.ts` (strip groups; redact group events; resync for `InitiativeStartUndone`), `activityLog.ts` sentences. Tests in `packages/shared/test/tokenDuplicate.test.ts`, `tokenGroups.test.ts` (FR-GM-16, FR-GM-21, FR-REC-02).
- `apps/server`: no route changes; integration test `apps/server/test/tokenGroups.test.ts` (GM + player: no group data reaches the player; forged player commands rejected).
- `apps/web`: `panels/TokenRoster.tsx` (groups, Duplicate), token editor Duplicate ×N, `panels/InitiativeTracker.tsx` (include list, start from groups), new `panels/GroupsControls.tsx`, CSS.
- New ADR `docs/adr/0026-token-groups-and-duplicate.md`.
- Old stored states and logs: new state fields default to empty; no migration.
