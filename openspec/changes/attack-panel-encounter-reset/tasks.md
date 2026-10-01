# Tasks

## 1. Helpers

- [x] 1.1 Add `LAST_USED_KEY` and `latestAttackRoll(rolls, participantId, clearedRollId)` to `apps/web/src/panels/attackRoll.ts`. Verify in `apps/web/test/attackRoll.test.ts` that it returns the latest attack roll, hides the cleared one, and shows a later one.
- [x] 1.2 Add `apps/web/src/panels/attackSession.ts` with `useEncounterReset`: on a live `initiative` non-null to null change, clear the target, clear `vtt.attack.last`, record the cleared roll id per room, and bump the count.

## 2. Attack section

- [x] 2.1 Pass the reset from `RoomPage` through `RoomPanel` to `AttackPanel`; clear only the target (the attacker stays); hide the cleared roll in `LatestAttack`; clear `lastUsed` in memory on a new count; key `AttackForm` on `attackerId:count`.
- [x] 2.2 Replace tap-to-roll with a dropdown of named attacks (name and dice per option), an edit button for the selected attack, and a Roll button naming attack and target; select the first attack by default and a newly added one after Save. The dropdown is `AttackPicker.tsx`, a select-only combobox styled like the app's popovers. (A list of toggle rows was replaced because it grows with every attack. A native `<select>` was replaced because it didn't match the app's look.)
- [x] 2.3 Style the picker in `styles.css` and drop the unused list-row and select styles.

- [x] 2.4 In `RoomPanel.tsx`, render `InitiativeTracker` above `AttackPanel` in the Play tab.

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test`.
- [x] 3.2 Playwright (run from a script with `playwright-core`; the Playwright MCP browser profile was locked by another session): start an encounter, add two attacks, pick the second, roll at a target, end the encounter; check the card, target and custom settings clear and both attacks remain; roll again and check the card returns.
