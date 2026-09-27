## Why

`attack-targeting` records who attacked whom, but everything after the roll still happens in voice chat. The GM says "that hits", the player rolls damage, and the GM edits the monster's HP by hand. Nothing records whether an attack hit, the player can't see that the GM is still deciding, and the GM retypes every damage number. The table agreed on these rules:
- Players roll without asking.
- The GM rules on the result afterwards.
- The app never decides hit or miss (README §7).

This change adds the GM's side of that flow and makes the ruling visible to the whole table.

## What Changes

- **Roll type.** The Attack section gets a **To hit / Damage** choice, remembered by saved attacks and last-used settings. The roll records its type. Unmarked attack rolls count as To hit.
- **GM rulings.** The GM marks a to-hit roll **Hit** or **Miss**, and can change or clear the verdict. Everyone who can see the roll sees the verdict on it, e.g. "Aria → Goblin · Longsword · 1d20+5 = 17 · Hit".
- **Applying damage.** On a damage roll the GM taps **Apply −N**. The server lowers the target's current HP by the roll's total, once per roll. The server works out the new HP, so two taps or a stale screen can't apply it twice.
- **GM Rulings list** in the Play tab, GM only:
  - to-hit rolls waiting for a verdict, with the target's AC;
  - damage rolls not yet applied, with the target's HP;
  - newest first.

  In the Dice tab's roll log, the GM can also correct a verdict.
- **Player outcome.** The player's Attack section shows "Waiting for the GM" on their latest to-hit roll, then **Hit** or **Miss**. After a Hit, a **Roll damage** action switches to Damage (using their first saved damage attack, if any) and keeps the same target. A damage roll shows **Applied** once the GM applies it.
- **Contract change**, recorded in ADR 0011 for review by the Real-Time Architecture owner:
  - `dice.roll.attack` gains an optional `kind` (`toHit` | `damage`, default `toHit`), and `DiceRoll.attack` gains `kind`.
  - `DiceRoll` gains an optional `verdict` and `damageApplied`.
  - New commands `roll.rule` and `roll.applyDamage`, both GM only.
  - New events `RollRuled` (carries the previous verdict) and `RollDamageApplied`. Applying also emits the existing `TokenStatsSet` with the previous stats.
- **Visibility.**
  - Rulings and applications of a GM-only roll are withheld from players.
  - The new events carry no token IDs or names.
  - An HP change on a hidden target is withheld by the existing token rules.

## Non-goals

- Deciding hit or miss automatically, comparing against AC, critical hits, or resistances (README §7). The GM sees AC as a reference only.
- Asking the GM's permission before a roll.
- Healing through Apply, splitting damage across targets, and undo (FR-REC-02 is not built yet).
- Hiding token stats from players; that existing gap needs its own change.
- A per-token attack list stored in room state; saved attacks stay per browser.

## Capabilities

### New Capabilities
- `attack-rulings`:
  - the roll type on attack rolls;
  - GM verdicts and who may give them;
  - applying damage;
  - the GM Rulings list;
  - the player's view of the outcome;
  - what players may see of rulings.

### Modified Capabilities
- `room-activity-log`: adds a requirement for readable ruling and damage entries. It is added rather than modified, so it doesn't collide with `attack-targeting`'s pending change to "Readable attributed actions".

## Impact

- **Depends on `attack-targeting`,** which is implemented but not yet merged or archived. Build this on the same branch, or on one stacked on it. Archive `attack-targeting` first.
- **`packages/shared`:**
  - `dice.ts`: `AttackContext.kind`, `DiceRoll.verdict`, `DiceRoll.damageApplied`, and the verdict in `formatAttackRoll`.
  - `commands.ts`: `dice.roll.attack.kind`, `roll.rule` and `roll.applyDamage`.
  - `events.ts`: `RollRuled` and `RollDamageApplied`.
  - Also `decide.ts`, `reducer.ts`, `visibility.ts` and `activityLog.ts`, plus unit tests.
- **`apps/server`:** no pipeline change. A new wire test.
- **`apps/web`:**
  - `AttackPanel.tsx`: roll type, outcome, and Roll damage.
  - `attackRoll.ts`: the kind in stored settings.
  - New `RulingsPanel.tsx`.
  - `RoomPanel.tsx`: the Rulings list in Play for the GM.
  - `DicePanel.tsx`: the verdict in the log, and GM correction.
- **Docs:** `docs/adr/0011-attack-rulings.md`.
- **Compatibility:** no migration. `kind` defaults to `toHit`, and `verdict` and `damageApplied` are optional.
