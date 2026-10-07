## Why

The GM sees **Hit** and **Miss** chips under the latest attack roll in the Dice tab, and again on every attack roll in Roll history. Ruling already has its home in the Play tab: the Rulings list, and the GM's own latest-roll card in the Attack section. A second set of controls in the Dice tab reads as a stray copy of the Play panel. It also repeats the verdict right under the "· Hit" in the roll's title, and it acts differently: a toggle chip that clears when pressed again, where Play has full-size buttons with no clear.

## What Changes

- **No ruling controls in the Dice tab.** The latest-roll card and Roll history drop the Hit and Miss chips for the GM. They still show the verdict in the roll's title ("… = 17 · Hit") to everyone who can see the roll.
- **Ruling stays in Play, unchanged.** The Rulings list and the GM's Attack card keep their Hit, Miss and Apply −N buttons, pending count and "N rulings pending" exactly as they are.
- **Fixing a wrong ruling:** once a roll is ruled it leaves the Rulings list. The GM reverses it with **Undo** on the ruling's entry in the Activity log (ADR 0013, where `RollRuled` is already reversible). That puts the roll back in the Rulings list to rule again. There is no direct "change Hit to Miss" control any more.

**Unchanged:** commands, events, schemas, server rules, visibility rules and the activity log.

## Capabilities

### Modified Capabilities
- `attack-rulings`: "GM Rulings list" drops the sentence that let the GM set, change or clear a verdict from the Dice tab's roll log, and gains a scenario that the Dice tab has no ruling controls.

## Impact

- **`apps/web`:**
  - `panels/DicePanel.tsx`: the `roll.rule` handler, its busy set, and the `onRule`/`ruleBusy` props on `RollRow` and `RollHistory` go.
  - `styles.css`: the unused `.roll-verdict` rules go.
- **Tests:** `apps/web/test/dicePanelRulings.test.tsx` (new).
- **No change** to `packages/shared`, `apps/server`, `RulingsPanel.tsx`, `AttackPanel.tsx`, `RulingButtons.tsx`, or any ADR.
