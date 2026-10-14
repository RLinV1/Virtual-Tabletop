## Context

See proposal.md for motivation. Relevant current code:

- `token.create` already supports `count` (1–`MAX_TOKENS_PER_CREATE`), spreads copies with `spreadPositions` over the nearest free squares, and names them with `uniqueTokenName` (KAN-62, KAN-70). It emits one `TokenCreated` per copy in one command, so one `commandId`.
- Undo (ADR 0013) groups a command's events by `commandId`; only `REVERSIBLE_EVENT_TYPES` can be undone, each with `inverseOf`, `undoConflict` and a label. `TokenCreated` and `InitiativeStarted` are not in the set today.
- `InitiativeStarted` carries `previous: Initiative | null` and `scores[].previous`, so it already holds everything an undo needs (invariant 6).
- `filterStateForViewer` strips GM-only state (`undo`, `checkpoints`) by setting it empty; `filterEventForViewer` has an exhaustive switch.
- The Start encounter dialog lists every token with a score field; tokens left blank are not entered (`initiativeEntries`).

## Goals / Non-Goals

**Goals:**
- Duplicate as a thin command over the existing create path, so placement, naming and caps stay in one place.
- Groups as GM-only room state with the simplest membership model that guarantees "at most one group".
- Every new action reversible through the existing undo machinery.

**Non-Goals:**
- Multi-select copy that keeps relative layout (nice-to-have in the ticket; later).
- Groups that remember a starting layout or move across rooms (KAN-50 encounter templates).
- Group-aware fog, movement or targeting.

## Decisions

### 1. `token.duplicate { tokenId, count }` emits ordinary `TokenCreated` events

`decide` authorises (GM), looks the token up (concealed-as-missing for non-GMs, though only GMs pass authorisation), then builds the same events `token.create` would from the original's fields and `position`, via a shared helper extracted from the `token.create` branch. No new event type: replay, visibility and the activity log already handle `TokenCreated`.

*Alternative:* client sends `token.create` with copied fields. Rejected: the server already has the authoritative token (including named attacks), and a dedicated command reads clearly in the log ("Duplicated Goblin ×3").

### 2. `TokenCreated` becomes reversible

Inverse: `TokenDeleted { token: event.token }`. Conflict: refused unless `state.tokens[id]` deep-equals `event.token` (moved, edited, deleted or re-hidden since). Label: the created token's name. An action creating N tokens is N reversible events; undo is all or nothing as today. This also makes Add token and library placement undoable — an intended side effect, documented in the ADR.

### 3. Group state: `groups` + `tokenGroups`

```
TokenGroup = { id, name }                     // name 1–40, unique per room (normalised)
RoomState.groups: Record<Id, TokenGroup>      // creation order = insertion order; cap 30
RoomState.tokenGroups: Record<TokenId, GroupId>
```

A map from token to group makes "at most one group" structural instead of a check across lists. Membership is **not** removed when a token is deleted: the entry stays, the UI shows only existing tokens, and an undone deletion or a checkpoint restore brings the token back into its group with no extra event. Entries for tokens that never come back are harmless; `group.delete` removes all entries for its group, and `tokenGroups` is bounded by the number of tokens ever created, which the token cap and room lifetime keep small. Both fields default to `{}` in `emptyRoomState` and in the zod schema (`.default({})`) so stored snapshots and old logs load unchanged. Groups are not part of `TableState`: checkpoints and encounter templates restore the board, not the GM's organisation.

### 4. Commands and events

| Command | Event (carries replaced values) |
|---|---|
| `group.create { name }` | `GroupCreated { group }` |
| `group.rename { groupId, name }` | `GroupRenamed { groupId, name, previous }` |
| `group.delete { groupId }` | `GroupDeleted { group, members: TokenId[] }` |
| `group.assign { groupId: Id \| null, tokenIds (1–100) }` | `TokensGrouped { groupId, changes: [{ tokenId, previous: GroupId \| null }] }` |

All GM-only. `group.assign` rejects unknown tokens and an unknown group; tokens already in the target group are skipped, and an assignment that changes nothing is rejected as invalid (no empty events).

Inverses: `GroupCreated` ↔ `GroupDeleted { members: [] }`; `GroupRenamed` swaps `name`/`previous`; `GroupDeleted` → `GroupCreated` followed by `TokensGrouped` restoring `members` — so `inverseOf` returns `DomainEvent[]` (a small signature change; existing cases wrap in an array); `TokensGrouped` → per-`previous` value, one `TokensGrouped` per distinct previous group. Conflicts: refused when the group's current name / existence / each token's current group differs from what the event set.

### 5. Undoing an initiative start: `InitiativeStartUndone`

`InitiativeStarted` joins the reversible set. Its inverse cannot be another `InitiativeStarted` when `previous` is null, so a new compensating event `InitiativeStartUndone { initiative: Initiative | null, previous: Initiative, scores: [{ tokenId, score: InitiativeScore | null, previous }] }` sets the turn order back to `initiative` (possibly null) and each token's saved score to `score`. Conflict: refused unless `state.initiative` deep-equals the started order (advancing or ending changes it). For players it is `resync`, like every other initiative event, so the filtered turn order is all they get.

*Alternative:* make `InitiativeStarted.initiative` nullable. Rejected: it changes an existing event's meaning for every reader.

### 6. Visibility

`filterStateForViewer` (non-GM): `groups: {}`, `tokenGroups: {}`. `filterEventForViewer`: `GroupCreated`, `GroupRenamed`, `GroupDeleted`, `TokensGrouped` → `redacted`; `InitiativeStartUndone` → `resync`. Snapshot, reconnect and REST paths already go through these.

### 7. Web

- Roster (GM): grouped sections via a `groupedTokens(state)` helper (pure, unit-tested); heading with a collapse toggle, Rename, Delete, Hide all / Show all (one `token.setHidden` per token, sent in sequence; each is its own undoable action — acceptable, and matches FR-GM-16's per-token command). Group membership is set from the token editor's Group field; a "New group" form sits under the roster. "Select all" from the ticket is deferred: the board selects one token at a time, and multi-select is its own change. Starting from groups lives in the Start encounter dialog ("Start from groups"), which keeps one way in.
- Token editor and roster row: "Duplicate" with a count field (default 1).
- Start encounter dialog: each token row gets an "Include" checkbox; opening it from groups pre-checks group tokens plus tokens owned by an active player; opening it normally pre-checks all (today's behaviour). Only included tokens with a score are sent.

## Risks / Trade-offs

- [Making all creations undoable could surprise a GM who undoes the wrong entry] → Activity log labels name the tokens ("Added Goblin, Goblin 2"); conflict check refuses if anything changed.
- [`inverseOf` returning an array touches every caller] → One caller (`decide` `history.undo`); covered by existing undo tests.
- [Hide all sends N commands, not one action] → Keeps the existing visibility contract; a batched `token.setHidden` is a separate change if GMs ask.
- [Stale `tokenGroups` entries] → Bounded; never sent to players; pruned when the group is deleted.

## Migration Plan

Additive state with defaults; new events fail old clients' `assertNever`, so deploy web and server together as with every event addition. Rollback: the new events stay in logs; a rolled-back server would fail to reduce them, so do not roll back past this once groups are used in production rooms (same rule as ADR 0019).
