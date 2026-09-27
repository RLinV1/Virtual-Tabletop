## 1. ADR

- [x] 1.1 Write `docs/adr/0010-attack-roll-context.md` covering the optional `dice.roll.attack` / `DiceRoll.attack` shape, name and hidden flags stored at roll time, the null-side player filtering and resync rule, and backward compatibility. Mark it Proposed and ask the Real-Time Architecture owner to review. Verify the file exists and links this change.

## 2. Contract (packages/shared)

- [x] 2.1 In `dice.ts`, add the `AttackSide` (`{ tokenId, name, hidden }`) and `DiceRoll.attack` (`{ actor: AttackSide | null, target: AttackSide | null, label: string | null }`, optional) schemas. In `commands.ts`, add the optional `attack: { actorTokenId, targetTokenId, label? }` (label trimmed, max 40) to `dice.roll`. Verify that `npm run typecheck` passes and existing `dice.test.ts` is unchanged and green.
- [x] 2.2 Add `can.attackWith` and handle `attack` in `decide`'s `dice.roll` case in this order: attacker visible → controlled → target visible → not the same token. Write names and hidden flags from state; an empty label becomes null. Verify with new tests in `test/attackRolls.test.ts` (FR-TAC-09): owner accepted, stranger forbidden, hidden attacker or target is `not_found` for a player, self-target invalid, GM with a hidden token accepted with `hidden: true`, plain rolls unchanged, both sides always non-null.
- [x] 2.3 Extend `filterStateForViewer` to null out attack sides for players: token currently hidden, or gone and `hidden` at roll time. Extend `filterEventForViewer` to `resync` a public `DiceRolled` with any `hidden: true` side. Verify with `visibility.test.ts` cases (FR-GM-23): a public hidden-attacker roll never exposes the ID or name, a target hidden after the roll is stripped, a deleted previously visible target keeps its name, GM output is unfiltered, and GM-only attack rolls are still redacted.
- [x] 2.4 Add `formatAttackRoll` ("Aria → Goblin 2 · Longsword · 1d20+5 = 17", "Unknown" for a null side). Update the `DiceRolled` activity-log sentence for attack rolls. Verify with `activityLog.test.ts`, including the rename or deletion case keeping the roll-time names.

## 3. Server

- [x] 3.1 Add `apps/server/test/attackRolls.test.ts` with GM and player clients. Verify that:
  - a player's attack roll converges on all clients with names;
  - a forged attack naming another player's token is rejected;
  - a GM public attack with a hidden token reaches the player with a null side, and the player's raw socket traffic never contains the hidden token's ID or name;
  - hiding the target afterwards strips it from the player's next snapshot.

## 4. Web

- [x] 4.1 Add `{ kind: "attack"; attackerId }` to `BoardTool`, a crosshair cursor, and a hint in `Board.tsx`. In `BoardView`, track the hovered token and draw the attacker→hover line with a `measure` distance label, send a left press on another token to a `pickTarget` callback, and ignore the attacker and empty board. Verify in Playwright that the line and "15 ft" label appear over a token three squares away, and clicking the attacker does nothing.
- [x] 4.2 Add `BoardHandle.startAttack(tokenId)`. It remembers and restores the previous tool on `Esc`, right-click, pick, or when the attacker leaves state. Verify in Playwright that `Esc` returns to the prior tool and sends no command or ping.
- [x] 4.3 (Replaced by section 6: the dialog is removed.) Create `panels/AttackDialog.tsx` (on `Modal`) with attacker and target names, label, bonus (−99…99, prefilled from `usePersistentState` key `vtt.attack.bonus` per token, default 0), a GM-only visibility toggle for the GM, and a note when the GM rolls publicly with a hidden token. Confirm sends `dice.roll` with `1d20±bonus` and `attack`, then pings the target's center only when the roll is accepted and public. Verify in Playwright that the bonus survives a reload and a GM-only roll sends no ping to the player.
- [x] 4.4 (Replaced by section 6: the buttons are removed.) Add Attack buttons to `MyTokens` rows (owned tokens) and `TokenRoster` rows (tokens passing the `can.attackWith` hint), highlighted on the token's turn, which call `startAttack`. Verify in Playwright that a player sees Attack only on their own tokens and the GM sees it on every token.
- [x] 4.5 Render attack rolls in the `DicePanel` roll log and history with `formatAttackRoll`, keeping the dice tray animation. Verify in Playwright with two browsers that both show "Aria → Goblin 2 · Longsword · 1d20+5 = N" with no hit or miss text and no HP change.

## 5. Verification

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
- [x] 5.2 Run the `visibility-auditor` and `sync-reviewer` agents on the diff and resolve any findings before opening the PR (title references FR-TAC-05/FR-TAC-09/FR-GM-22).

## 6. Attack section in Play

- [x] 6.1 In `panels/attackRoll.ts`, replace the bonus helpers:
  - `attackExpression({ count, sides, modifier })`;
  - validators for the `vtt.attack.last` and `vtt.attack.saved` records;
  - `targetsByDistance(state, attackerId)`: visible tokens other than the attacker, nearest first, with `measure` units and labels.

  Verify with `apps/web/test/attackRoll.test.ts`: expressions for each die type and sign, limits, rejected stored shapes, and ordering and exclusion of the attacker.
- [x] 6.2 Add `panels/AttackPanel.tsx` to the Play tab below My tokens, with:
  - the attacker list (`can.attackWith` hint, active turn preselected);
  - the target row with ✕;
  - **Pick on board** (via `BoardHandle.startAttack`);
  - the distance-sorted target list.

  Also hold `{ attackerId, targetId }` in `RoomPage`, and add `Board`'s `onPickTarget` prop and `BoardHandle.showPing`. The target stays after a roll, and is dropped when it leaves state or becomes the attacker. Verify in the browser with a GM and a player: a player sees only their tokens as attackers, the list is nearest first, a board pick fills the target, and `Esc` leaves the target unchanged.
- [x] 6.3 Add the dice picker (d4–d100, count 1–20, modifier −99…99), label, the GM-only toggle with the hidden-token note, and **Roll "NdX±M at <target>"**:
  - sends `dice.roll` with `attack`;
  - pings only when `shouldPingTarget`;
  - shows refusals inline;
  - saves `vtt.attack.last` per token.

  Verify in the browser that an attack and a following `1d8+3` damage roll both land against the same target, and that the settings return after a reload.
- [x] 6.4 Add saved attacks: save the current dice and label for the attacker, tap to fill without rolling, remove, at most 8 per token, in `vtt.attack.saved`. Verify in the browser that "Damage 1d8+3" survives a reload and tapping it rolls nothing.
- [x] 6.5 Show the viewer's latest attack roll in the section, with the `DiceTray` landing and the roll line. Verify in the browser that the tray animates and the line reads "Aria → Goblin 2 · Longsword · 1d20+5 = N".
- [x] 6.6 Remove `AttackDialog.tsx`, `AttackButton.tsx` and the Attack buttons in `MyTokens` and `TokenRoster` (plus their CSS). Update ADR 0010's "attack dialog warns the GM" to "Attack section". Verify that `npm run lint && npm run typecheck` pass and no reference remains (`grep -r AttackDialog apps/web/src`).
- [x] 6.7 Run `npm run lint && npm run typecheck && npm test`, and re-run the `visibility-auditor` on the web diff (pings and the target list). Resolve its findings.
