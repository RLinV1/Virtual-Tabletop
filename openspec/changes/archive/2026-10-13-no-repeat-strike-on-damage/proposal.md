## Why

The usual attack takes two rolls: to hit, then **Roll damage** after the GM rules a hit. The board plays the strike from attacker to target on both, so the same swing animates twice. The second strike adds nothing, because the hit effect has already landed on the target and the "−N" will float up when damage is applied.

## What Changes

- A damage roll no longer plays the strike when it follows a to-hit roll. It follows one when the latest earlier attack roll in this viewer's copy of the room, from the same attacker at the same target, is a to-hit roll.
- A damage roll that follows nothing still strikes as today. This covers a named attack with no to-hit (such as Magic Missile), a damage-only Custom roll, and a damage roll whose to-hit this viewer never saw. A to-hit that was a GM-only roll counts as never seen.
- Nothing replaces the skipped strike. The dice still land on the board, and applying damage still floats "−N" from the target.
- Every viewer decides from their own filtered copy of the room. No new commands, events, state or schema, so no ADR.

## Non-goals

- Changing the to-hit strike, the Hit and Miss effects or the damage number.
- Linking a damage roll to its to-hit roll in the shared schema. That would be exact but needs a contract change.
- Skipping the strike on a damage roll whose to-hit has dropped out of the 30-roll history. That case still strikes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `board-attack-effects`: "Attack animation" no longer strikes for a damage roll that follows a to-hit roll for the same attacker and target.

## Impact

- `apps/web/src/board/effects.ts`: `attackEffectFor`'s `DiceRolled` case.
- `apps/web/test/boardEffects.test.ts`: new cases.
- `packages/shared`, `apps/server`: none.
