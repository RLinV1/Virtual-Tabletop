## Why

A walkthrough of a full round with the current Attack section and Rulings list showed friction for both roles.
- **Players** repeat the same two or three attacks all session. Yet the full dice builder is always open, a saved attack takes two taps, a to-hit roll and its damage are unrelated chips, and the result appears below the fold, out of sight once they've rolled.
- **The GM**
  - Has the attacker stick to the last monster picked, so the next monster's turn can roll for the wrong one. This is a bug.
  - Has to leave the Attack section to rule on their own roll.
  - Gets no signal outside the Play tab that rulings are waiting.
  - Can advance the turn with rulings still open.

This change applies "reduce noise, keep the primary action primary, show status near the action" to the same features, without changing the shared contract.

## What Changes

**Quick wins (no data change)**
- **The attacker follows the turn.** When the active turn moves to a token the viewer controls, the Attack section switches to it, even after the viewer picked a different attacker. This fixes the GM rolling for the previous monster.
- **No dropdown with one token.** A viewer who controls a single token sees its name, not a dropdown.
- **Outcome at the top.** The viewer's latest attack roll (dice tray, result, "Waiting for the GM", Hit or Miss, Applied, and follow-up actions) moves to the top of the section.
- **Custom roll collapsed.** The dice builder (roll type, die, count, modifier, label, GM-only) sits under a collapsed **Custom roll**. It stays open while in use, and each browser remembers whether it was left open.
- **Pending indicator on the Play tab.**
  - For the GM: the number of rulings waiting.
  - For a player: a dot when the GM rules on, or applies, their latest roll while they are on another tab. The dot clears when they open Play.
- **Pending note at Next turn.** Beside the GM's **Next turn**: "2 rulings pending". It is a reminder, not a block.
- **GM rules inline.** The GM can mark their own latest to-hit roll Hit or Miss, or apply their own latest damage roll, right on the outcome card.
- **Bigger GM buttons.** Hit, Miss and Apply in the Rulings list become full-size buttons.

**Named attacks**
- **A named attack holds both rolls.** A saved attack becomes a named attack with a name, an optional to-hit roll (e.g. `1d20+5`) and an optional damage roll (e.g. `1d8+3`). Named attacks are stored per token in the browser, as saved attacks are today, up to 8 per token.
- **One tap to hit.** Tapping a named attack rolls its to-hit against the chosen target. The Roll damage step then rolls that named attack's damage in one tap.
- **Damage-only attacks** (a save spell, a trap) roll damage straight away when tapped.
- **Editing.** Named attacks are added, edited and removed in a small inline editor.
- **Migration.** Existing saved attacks become named attacks when first read: a to-hit one keeps its to-hit roll, and a damage one becomes damage-only.
- **Custom rolls** stay available under Custom roll for anything else.

**Unchanged:** commands, events, schemas, server rules, visibility rules, and what the GM rules on.

## Non-goals

- Grouping allies apart from enemies in the target list (a later option).
- Syncing named attacks across devices or storing them in room state.
- Blocking Next turn while rulings are pending.
- Rolling one named attack against several targets.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `attack-rolls` (from `attack-targeting`, not yet archived):
  - "Attack section in Play": the attacker follows the turn, and there is no dropdown for one token.
  - "Choosing dice and rolling": custom rolls are collapsed, and the outcome is at the top.
  - "Saved attacks": replaced by named attacks.
- `attack-rulings` (from `attack-rulings`, not yet archived):
  - "GM Rulings list": the tab indicator, larger controls, and the Next-turn note.
  - "Player sees the outcome": the outcome card at the top, a one-tap Roll damage from a named attack, the player tab indicator, and inline GM rulings.

## Impact

- **Order:** archive `attack-targeting` and `attack-rulings` before this change, so its MODIFIED requirements have a main spec to apply to.
- **`apps/web`:**
  - `panels/AttackPanel.tsx`: layout, the outcome card, named attacks, and the attacker following the turn.
  - `panels/attackRoll.ts`: the named attack type, validators, migration from `vtt.attack.saved`, and `presetForRoll`.
  - `panels/RulingsPanel.tsx`: button size.
  - `panels/RoomPanel.tsx` (`PanelTabs`): the Play indicator.
  - `pages/RoomPage.tsx`: seen-outcome tracking for the player dot.
  - `panels/InitiativeTracker.tsx`: the pending note.
  - `styles.css`.
- **Tests:** `apps/web/test/attackRoll.test.ts`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
