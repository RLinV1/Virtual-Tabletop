# ADR 0026: Token groups, duplicate, and undo for creation and encounter starts

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Amends:** `docs/adr/0013-undo.md` (reversible set, `inverseOf`)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-82-duplicate-tokens-and-groups` · **Ticket:** KAN-82

## Context

GMs place several copies of the same creature and run one group of enemies at a time. Copying a token meant filling in Add token again, and starting initiative meant picking every combatant by hand. KAN-82 asks for a Duplicate action, GM-only named groups of tokens, starting an encounter from groups, and each of these as one undoable action (FR-REC-02).

## Decision

### Duplicate is a command, not an event

`token.duplicate { tokenId, count 1–20 }` (GM only) emits ordinary `TokenCreated` events built by the same helper as `token.create`: the original's fields minus its id and remembered initiative score, numbered by the unique-name rule (KAN-62), on the nearest free squares *beside* the original. No new event type, so replay, visibility and the activity log need nothing new.

### Groups are GM-only room state

```
TokenGroup = { id, name }                  // name 1–40, unique per room ignoring case/spaces
RoomState.groups: Record<Id, TokenGroup>   // insertion order = creation order; at most 30
RoomState.tokenGroups: Record<TokenId, GroupId>
```

A token-to-group map makes "a token is in at most one group" structural. Membership is not removed when a token is deleted, so a checkpoint restore (or a future undo of deletion) puts the token back in its group with no extra event; the roster ignores entries for tokens that are not there, and deleting a group drops its entries. Groups are not part of `TableState`: checkpoints and encounter templates restore the board, not the GM's organisation.

Commands `group.create`, `group.rename`, `group.delete`, `group.assign { groupId | null, tokenIds }` produce `GroupCreated { group }`, `GroupRenamed { groupId, name, previous }`, `GroupDeleted { group, members }` and `TokensGrouped { groupId, changes: [{ tokenId, previous }] }`, each carrying the values it replaced (invariant 6).

### Visibility

`filterStateForViewer` gives players `groups: {}` and `tokenGroups: {}`. Every group event is `redacted` for players. Group names and membership never cross the wire to a player.

### Undo additions (amends ADR 0013)

- `inverseOf` now returns `DomainEvent[]`: undoing a group deletion needs `GroupCreated` followed by `TokensGrouped`. `history.undo` flattens the reversed list, keeping each inverse's own order.
- **`TokenCreated`** is reversible: inverse `TokenDeleted { token }`; refused unless the token still exists exactly as created. This also makes Add token and library placements undoable.
- **`InitiativeStarted`** is reversible through a new compensating event **`InitiativeStartUndone { initiative | null, previous, scores }`**, which restores the turn order (possibly none) and each token's saved score. Refused once the order has changed (advanced or ended). For players it is a `resync`, like every other initiative event.
- Group events are reversible with conflict checks on name, existence, membership, the group cap and name clashes.

## Consequences

- New events fail older clients' reducers, so web and server deploy together (as for every event addition).
- `RoomState` gains two fields with empty defaults; states are always built from events, so old logs replay unchanged.
- "Select all of a group" on the board is deferred: the board selects one token at a time.

## Alternatives considered

- **Client-side duplicate via `token.create`.** The server already holds the authoritative token, including named attacks; a dedicated command also reads clearly in the log.
- **Groups as `tokenIds` lists on each group.** "At most one group" would become a cross-list check and each assignment would touch several groups.
- **Making `InitiativeStarted.initiative` nullable for its inverse.** Would change the meaning of an existing event for every reader.
