## Why

Every time the GM starts an encounter, the Start encounter popup is empty and they retype each token's initiative, even for the same monsters and party from the last fight. The scores are thrown away the moment the turn order is built, so a recurring party or a repeat encounter always starts from nothing.

## What Changes

- **Initiative saved on the token.** When the GM starts an encounter, each score they enter is saved on that token in the room. The score stays after the encounter ends and across sessions, like HP and conditions.
- **Popup still shows.** The Start encounter popup opens as before, but each token's field is pre-filled with its saved score. The GM can accept, edit or clear any of them before starting. Tokens with no saved score start empty.
- **Edits update the saved value.** Starting an encounter saves every score typed in the popup, replacing the old saved value. A token left blank does not get a turn and keeps whatever score it had.
- **Append-only.** The event records each replaced value, so history stays intact (invariant 6). Initiative events are not part of undo today.
- **Shared schema change.** Adds `initiative` to the token and a `scores` list to the `InitiativeStarted` event, so this needs a new ADR and review by the Real-Time Architecture owner.

## Non-goals

- Rolling initiative automatically or from stats.
- Changing turn-order sorting, advancing, or ending an encounter.
- Showing saved scores to players beyond what the turn order already shows.

## Capabilities

### New Capabilities
- `token-initiative-memory`: saving initiative scores per token when an encounter starts, and pre-filling them in the popup next time.

### Modified Capabilities
<!-- None in main specs: initiative is not yet covered by an archived spec. -->

## Impact

- **`packages/shared`:** `Token` gains `initiative: number | null` (optional on parse, default null); `InitiativeStarted` gains `scores` (each with `previous`); `decide` for `initiative.start` emits them; `reduce` applies them; both visibility filters keep hidden tokens' scores private. New ADR in `docs/adr/`.
- **`apps/web/src/panels/InitiativeTracker.tsx`:** pre-fill the popup from `token.initiative`.
- **Persistence and server:** event schemas are shared, so the server and stores pick the field up; stored events from before this change load with no scores.
- **Tests:** shared unit tests for decide, reduce and visibility; a server integration test that a later encounter sees the saved scores; popup pre-fill test.
