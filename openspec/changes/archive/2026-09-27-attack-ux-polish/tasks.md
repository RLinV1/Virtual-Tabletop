## 1. Helpers (apps/web/src/panels/attackRoll.ts)

- [x] 1.1 Add the `AttackPreset` type, `isPresetRecord`, `MAX_PRESETS` (8), `migrateSaved(saved)`, `presetForRoll(presets, roll)`, `presetRollLabel(preset, kind)` (with 40-character truncation) and `presetSummary(preset)` ("+5 · 1d8+3"). Verify with `apps/web/test/attackRoll.test.ts`:
  - to-hit and damage saved attacks migrate to named attacks;
  - an unnamed one takes its expression as name;
  - the validator rejects a named attack with neither roll and more than 8 named attacks;
  - `presetForRoll` matches by label and attacker and returns null otherwise;
  - labels truncate.
- [x] 1.2 Add `outcomeKey(roll)` for the player's tab indicator. Verify that the key changes when a verdict is set, changed or cleared, or damage is applied, and is null for a roll without an outcome.

## 2. Quick wins

- [x] 2.1 **Attacker follows the turn** (design Decision 1): when the active-turn token changes to one the viewer controls, switch the attacker. Show the attacker as text when the viewer controls one token. Verify in the browser that the GM picks Goblin A, advances to Goblin B's turn, and the section shows Goblin B, and that a one-token player sees "Attack · Aria" with no dropdown.
- [x] 2.2 **Layout:**
  - move the outcome card (`LatestAttack`) to directly below the attacker line;
  - wrap the builder in a `<details>` **Custom roll** remembered in `vtt.ui.customRoll`;
  - keep the GM-only checkbox outside it.

  Verify in the browser that after a roll the result is visible without scrolling at 1024×768, and Custom roll stays collapsed or open across reloads.
- [x] 2.3 **Shared `RulingButtons`** (Hit / Miss / Apply −N as full-size buttons), used in `RulingsPanel` and in the GM's outcome card for their own latest roll. Verify in the browser that the GM rolls Goblin A's to-hit and rules Miss from the card, and the Rulings list no longer shows it.
- [x] 2.4 **Pending indicators:**
  - `PanelTabs` gets `badges`;
  - for the GM, the pending count on Play;
  - for a player, the new-ruling dot tracked in `RoomPage` and cleared on opening Play;
  - "N rulings pending" beside Next turn.

  Verify in the browser that the GM sees "Play 2" from the Tokens tab and "2 rulings pending" by Next turn (which still advances), and that a player on the Dice tab gets a dot on Play when their roll is ruled, which clears on opening Play.

## 3. Named attacks

- [x] 3.1 **Attack list:** attack buttons in the Attack section (unavailable without a target), reading `vtt.attack.presets`, with migration from `vtt.attack.saved`. Tapping one rolls to hit, or damage for damage-only named attacks, with the named attack's label, and pings as before. Verify in the browser that tapping Longsword rolls `1d20+5` "Longsword" at the target in one tap, and that a browser with old saved chips shows them as named attacks.
- [x] 3.2 **Attack editor:** add, edit and remove inline (name, optional to-hit and damage dice), max 8, then remove the old 🔖 save and saved chips. Verify in the browser that adding "Longsword +5 / 1d8+3" survives a reload, editing updates the summary, and removing works.
- [x] 3.3 **Roll damage from a named attack:** after a Hit on a named attack roll, **Roll damage 1d8+3** rolls "Longsword damage" immediately. Otherwise it opens Custom roll set to Damage. Verify in the browser that a player rolls Longsword, the GM rules Hit, and one tap on the player's side rolls damage that shows up in the GM's list as Apply −N.

## 5. Quiet outside combat

- [x] 5.1 Add `attackSectionChange` in `attackRoll.ts`, with unit tests for: encounter start → open; end → collapse; own turn → open unless toggled this encounter; nothing on other changes.
- [x] 5.2 Extend `SectionCollapseProvider` (`setCollapsed`, `hasChoice`, `toggledSince`), and add the hook in `RoomPanel` plus the "Attack · no encounter running" heading. Verify in the browser:
  - a fresh browser with no encounter shows Attack collapsed;
  - Start encounter opens it for the GM and the player, and End encounter collapses it;
  - a player who collapses it mid-encounter keeps it collapsed when their turn comes;
  - opening it with no encounter gives full, working controls.

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
- [x] 4.2 Run the `visibility-auditor` on the web diff (pings from taps on named attacks, tab indicators, anything shown to players) and resolve its findings.
