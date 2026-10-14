# Tasks

## 1. Dice tab

- [x] 1.1 In `apps/web/src/panels/DicePanel.tsx`, remove the `roll.rule` handler and its busy set, and the `onRule`/`ruleBusy` props from `RollRow` and `RollHistory`. Keep the verdict in the roll title (`formatAttackRoll`).
- [x] 1.2 Remove the `.roll-verdict` rules from `apps/web/src/styles.css`.
- [x] 1.3 Add `apps/web/test/dicePanelRulings.test.tsx`: the GM's Dice panel renders no Hit or Miss for a to-hit roll, ruled or not, and a ruled roll's title still ends with its verdict. Verify it fails on the old panel and passes on the new one.

## 2. Verify

- [x] 2.1 `npm run lint && npm run typecheck && npm test`.
- [x] 2.2 In the browser, as the GM with a player rolling to hit: the Dice tab (latest roll and Roll history) has no Hit or Miss; the Play tab's Rulings list and the GM's Attack card still rule, the roll leaves the list, and the Dice tab title then ends "· Hit".
