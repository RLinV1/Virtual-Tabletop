## Context

`initiative.start` carries `entries: { tokenId, score }[]`. `decide` sorts them into `order` and emits `InitiativeStarted { initiative, previous }`. The state keeps only the order, so scores are lost. `InitiativeTracker` holds the typed scores in component state and clears them on success. The shared package is the contract (CLAUDE.md): a change to existing schemas needs an ADR and review by the Real-Time Architecture owner.

## Goals / Non-Goals

**Goals:** persist each token's last-entered score; pre-fill it next time; stay append-only and undoable; leak nothing about hidden tokens.
**Non-Goals:** automatic rolls; changing ordering or turn advancement.

## Decisions

1. **Store on the token.** Add `initiative: z.number().int().min(-99).max(999).nullish()` to `Token`. A token's saved score then follows existing token behaviour: hidden tokens are already withheld from players (invariant 3), checkpoints restore it, deletion removes it, and duplication through creature templates can ignore it. Rejected: a separate `scores` map on the room state, which would need its own visibility rule to keep hidden tokens' scores private and its own cleanup on token deletion.
2. **Event carries scores and the replaced values.** `InitiativeStarted` gains `scores: { tokenId, score, previous: number | null }[]`, optional on parse and defaulting to `[]`, so events from before this change load unchanged. This satisfies invariant 6 and lets undo restore earlier scores.
3. **`decide` stays pure.** For each entry it emits one score with `previous` read from `state.tokens[tokenId].initiative ?? null`. Authorization and the existing validation (unknown token, duplicates) run first and are unchanged.
4. **`reduce` applies them.** `InitiativeStarted` sets `tokens[tokenId].initiative = score` for each entry. Tokens absent from the entries keep their score.
5. **Undo.** Initiative events are not reversible today, so none is added. `previous` is recorded for history and any future undo.
6. **Visibility.** `token.initiative` travels with the token, so a player sees the score only on tokens they can see. `filterEventForViewer` already turns `InitiativeStarted` into a resync for players, so the `scores` list (which can name hidden tokens) is never sent raw.
7. **Popup.** `InitiativeTracker` initialises each field from `token.initiative` when the popup opens (not as persistent component state), so it shows current saved values and reflects scores changed elsewhere. Submitting sends every non-empty field as an entry. A field the GM clears is simply omitted, so that token keeps its saved score and gets no turn.
8. **Assumption: players may see saved scores on visible tokens.** The turn order already tells players the order; showing the number is a small step, but the UI will not display the number to players unless a later change asks for it. The state carries it.

## Risks / Trade-offs

- **Shared schema change:** needs ADR 0022 and architecture review. Mitigated by optional fields with defaults so old events and old clients parse.
- **Stale value after token edits:** scores are only written on encounter start, so renaming or moving a token never changes them.
- **Old clients:** a client built before this ignores `initiative` and `scores`; the zod schemas must not be strict about unknown keys on the wire.

## Migration Plan

Ship the schema with defaults, then the popup. No data migration: existing tokens read as `initiative: null`. Rollback leaves extra optional fields on stored events, which older code ignores.

## Open Questions

- Should clearing a field offer a way to erase a saved score outright? Assumed no for now; the GM can overwrite it with a new value.
