# ADR 0011 — GM rulings on attack rolls

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-09-27 · **Extends:** `docs/adr/0010-attack-roll-context.md`, `docs/adr/0001-event-model.md`
**Change:** `openspec/changes/attack-rulings` · **Requirements:** FR-TAC-07, FR-TAC-09, FR-GM-22, FR-GM-23

## Context

ADR 0010 records who attacked whom. What happens next still happens only in voice chat: the GM says "that hits", and the GM types the damage into the monster's HP. The table's rules are that players roll without asking, the GM rules afterwards, and the app never decides hit or miss (README §7). The GM needs a recorded way to rule and to apply damage, and players need to see the outcome.

## Decision

- **Roll type.** `AttackContext` gains `kind: "toHit" | "damage"`, with a zod default of `"toHit"`. `dice.roll.attack` gains an optional `kind` with the same default, and `decide` copies it through. Stored rolls without it parse as To hit. The type is informational: it only decides which GM actions apply.
- **Verdicts.**
  - Command `roll.rule { rollId, verdict: "hit" | "miss" | null }`, GM only (`null` clears).
  - Event `RollRuled { rollId, verdict, previous }`, carrying the replaced verdict (invariant 6).
  - `DiceRoll` gains an optional `verdict`.
  - `decide` checks, in order:
    1. the actor is the GM → otherwise `forbidden`;
    2. the roll is in `state.rolls` → otherwise `not_found`;
    3. the roll is a to-hit attack roll → otherwise `invalid`;
    4. the verdict actually changes → otherwise `invalid`.
- **Damage.**
  - Command `roll.applyDamage { rollId }`, GM only.
  - `decide` checks:
    - the roll is in `state.rolls` → otherwise `not_found`;
    - it is a damage roll that hasn't been applied → otherwise `invalid`;
    - its target still exists → otherwise `not_found`;
    - the target tracks HP → otherwise `invalid`.
  - It then emits:
    1. the existing `TokenStatsSet`, with `hp = max(−999, hp − amount)` and the previous stats. This is left out when HP wouldn't change (zero damage, or already at −999).
    2. `RollDamageApplied { rollId, amount }`, where `amount = max(0, total)`. This sets `DiceRoll.damageApplied`.
  - The server computes HP from current state, so a second tap is refused rather than applied twice. There is no floor at 0 HP; the app is system-agnostic.
- **Reducer.**
  - Both new events update the roll in `state.rolls` if it is still there, and do nothing otherwise, so replay stays safe if the roll window changes.
  - Stored events are loaded without parsing, so the zod default for `kind` never runs on replay. `reduce` therefore fills in `kind: "toHit"` for an attack roll that has none.
- **Visibility (invariant 3).**
  - For players, `RollRuled` and `RollDamageApplied` are `redacted` when their roll is GM-only or not in the state before the event. Otherwise they pass, except that `RollDamageApplied` is also `redacted` when the roll's target is concealed from players (`hidden` on the roll, or hidden before the event). "Applied" beside an Unknown target would say the hidden token still exists with HP, and after a reveal would tie it to the `TokenStatsSet` just before it.
  - `filterStateForViewer` drops `damageApplied` from a player's copy of a roll whose target it blanks.
  - Neither event carries a token ID or name.
  - The `TokenStatsSet` from applying keeps its existing rule: redacted when the token was hidden.
- **Activity log.** Sentences for a new, changed or cleared verdict and for applied damage, using the names stored on the roll.

## Consequences

- **Backward compatible data.** The new fields are defaulted or optional, so existing event logs replay unchanged and nothing needs migrating.
- **Deploy web and server together.** An older reducer's `assertNever` would throw on the two new events, as with every earlier event addition.
- **Only recent rolls can be ruled.** Rulings and applications work only on rolls still in the 30-roll state window; older rolls are refused as `not_found`.
- **Some inference remains, by design.** An HP change on a visible token is visible. Applying a GM-only damage roll therefore shows players a drop equal to its total. A visible drop can also match a public roll's total even with "Applied" withheld. Removing either would mean refusing the command.
- **Undo (FR-REC-02), when built:**
  - `RollDamageApplied` replaces a value that is always `false`, since a second apply is refused, so it carries no `previous`. Its inverse needs a dedicated compensating event, e.g. `RollDamageUnapplied`.
  - Nothing links the two events of one apply: `TokenStatsSet` has no `rollId`, and `RollDamageApplied` has no token or HP. Undo must reverse the command's events as one unit. Undoing only the last seq would leave HP lowered while the roll no longer shows Applied.
- **No automatic reversal.** Changing Hit to Miss after damage was applied does not restore HP. The GM corrects HP by hand until undo (FR-REC-02) exists.
- **Not covered here.**
  - Healing through Apply.
  - Splitting damage between targets.
  - Per-token attack lists in room state.
  - Hiding token stats from players.
