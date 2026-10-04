# ADR 0022: Initiative scores saved on tokens

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Amends:** FR-GM-21 turn order
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/token-initiative-memory`

## Context

`initiative.start` takes a score per token, sorts them into `Initiative.order`, and drops the scores. The GM retypes every score each time they start an encounter, even for the same monsters and party.

## Decision

- `Token` gains `initiative: number | null` (optional; absent reads as none). It is the score the GM last gave the token when starting an encounter, and it outlives the encounter.
- `InitiativeStarted` gains optional `scores: { tokenId, score, previous }[]`: the entered scores and the value each replaced (invariant 6). `decide` fills it from the command's entries and each token's current score; `reduce` writes each score onto its token. Tokens not in the entries keep their score. Events from before this change have no `scores` and reduce exactly as before.
- Start encounter still opens its dialog each time, now pre-filled from `token.initiative`. A cleared field is left out of the entries, so that token gets no turn and keeps its saved score.

## Visibility

The score lives on the token, so a viewer receives it only on tokens they can see; hidden or fogged tokens are withheld as before. `InitiativeStarted` already resyncs players with a filtered snapshot, so the event's `scores` list, which can name hidden tokens, is never sent to them raw.

## Consequences

- Initiative events are not part of undo today, so none is added; `previous` is recorded for history and a future undo.
- Old clients ignore the new optional fields.
- Checkpoints restore the board's tokens, so they restore saved scores with them.
