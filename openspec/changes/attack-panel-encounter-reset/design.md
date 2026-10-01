# Design

## Context

- The attacker and target pick (`AttackPick`) already live in `RoomPage`, so they survive leaving the Play tab.
- Named attacks are stored per token, so the list shows the chosen attacker's attacks.
- The latest-roll card (`LatestAttack`) derives from `state.rolls`: the viewer's newest roll with attack context. Rolls stay in room state (up to `ROLL_LOG_LIMIT`), so ending the encounter does not remove it.
- Custom roll settings per token live in browser storage under `vtt.attack.last`, read by `AttackPanel` on mount.
- `RoomState` does not record when an encounter ended, and invariant 1 rules out adding client-side state to it.

## Decisions

1. **Detect the end on the client, in `RoomPage`.** `useEncounterReset` watches `state.initiative` and fires when it goes from non-null to null while the page is open. It lives in the room page, not the Attack section, so an encounter that ends while Play is hidden still clears. A room loaded with no encounter running clears nothing, so a reload doesn't wipe a pick made outside combat.
2. **Hide the card by roll id; delete nothing.** On the end, the hook records the viewer's latest attack roll id (`vtt.attack.cleared`, keyed by room, in browser storage). `latestAttackRoll(rolls, you, clearedRollId)` returns nothing while that roll is still the latest, and the next attack roll brings the card back. The id is persisted so a reload after the end doesn't bring the old card back. Room state and the dice log are unchanged (invariant 5).
3. **Clear custom settings in two places.** The hook writes `{}` to `vtt.attack.last` for an Attack section that mounts later; a mounted `AttackPanel` sees `reset.count` change and clears its in-memory copy. `AttackForm` is keyed on `attackerId:count`, so its selection, editor and half-set roll start over.
4. **Keep "Roll privately".** It stays as the GM set it. Resetting it to public could expose the next private roll, and the existing comment on that setting already warns against a quiet reset.
5. **A custom dropdown (`AttackPicker`), then Roll.** Review rejected two earlier versions. A list of toggle rows grew with every attack. A native `<select>` stayed one row tall but looked unlike the rest of the app. `AttackPicker` follows the WAI-ARIA select-only combobox pattern: a button with `role="combobox"` opens a `role="listbox"`. Focus stays on the button, and `aria-activedescendant` tracks the highlighted option. The keys are Up/Down/Home/End to move, Enter or Space to choose, Escape to close and Tab to leave. A press outside closes it. The closed button looks like the old attack rows (sword, bold name, dice on the right, caret). The open list uses the popover look (raised surface, strong border, shadow), with a check on the selected attack, and scrolls after 16rem. The pencil button beside it edits the selected attack, and the editor takes the picker's place while open. The Roll button repeats the attack and target names, so a roll is never ambiguous. The first attack is the default, so a token with one attack still rolls in one click.
6. **Keep the attacker.** Resetting the attacker pick makes the section fall back to the first token by name. Its named attacks then replace the ones the GM was using, which looks like the attacks were deleted. Found in Playwright verification; only the target is cleared.

## Risks

- A viewer whose page was closed when the encounter ended still sees the old card on their next load. Accepted: it clears on their next roll, and adding an encounter-end marker to room state would need a schema change and an ADR.
