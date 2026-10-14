## Context

`attackEffectFor(event, after, viewer)` in `apps/web/src/board/effects.ts` turns a live `DiceRolled` with both sides visible into `{ kind: "strike" }`, whatever `attack.kind` is. `Board.tsx` holds that strike until the roll's dice land. `after` is the viewer's filtered state after the event, so `after.rolls` is the newest-last roll log, at most `ROLL_LOG_LIMIT` (30) rolls, that already ends with the new roll. A player's copy has no GM-only rolls (`filterStateForViewer`), and sides hidden from them are `null`.

## Goals / Non-Goals

**Goals:** decide the skip inside `attackEffectFor`, from `after` alone, so `Board.tsx` and the dice wait stay unchanged.

**Non-Goals:** a schema link between rolls; any new effect.

## Decisions

### D1. Look back in `after.rolls` for the same pair

For a `DiceRolled` whose `attack.kind` is `"damage"`:

1. Find the new roll in `after.rolls` by `event.roll.id`.
2. Walk backwards from just before it.
3. Stop at the first roll whose `attack.actor?.tokenId` and `attack.target?.tokenId` equal the new roll's.
4. Return `null` (no strike) when that roll's `kind` is `"toHit"`. Otherwise keep the strike.

If the new roll isn't in `after.rolls` (it can't be, but defensively), search the whole log.

Only the latest roll for the pair counts. Damage, then damage again, both strike. To-hit, damage, damage gives one strike for the to-hit and one for the second damage roll. That matches "follows a to-hit roll".

*Alternative:* any earlier to-hit for the pair. Rejected because a pair attacked many times would never strike on damage again, even for a damage-only attack rolled long after.

### D2. Use the viewer's copy, not the GM's

The look-back reads only `after`, the viewer's own filtered state, so each viewer decides from what they saw. A GM-only to-hit is absent from a player's rolls, so a later public damage roll strikes for them. That's right, because they never saw the first strike. A to-hit whose sides were `null` for a player can't match, so the damage roll strikes, and only if both sides are now visible to them, as before.

### D3. Ruled Miss is not special

A to-hit ruled Miss and then a damage roll (half damage on a miss) is still a follow-up and plays nothing. The Miss effect has already played.

## Risks / Trade-offs

- [A to-hit that dropped out of the 30-roll log] → The damage roll strikes again. This is rare and harmless, and recorded as a non-goal.
- [A Custom damage roll meant as a separate attack right after a to-hit on the same pair] → It doesn't strike. Accepted: from the board's point of view the two can't be told apart without a schema link.
