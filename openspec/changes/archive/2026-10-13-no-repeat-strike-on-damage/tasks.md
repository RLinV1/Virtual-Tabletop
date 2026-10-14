## 1. Effect rule

- [x] 1.1 In `apps/web/src/board/effects.ts`, make `attackEffectFor` return `null` for a `DiceRolled` damage roll whose latest earlier attack roll in `after.rolls` from the same attacker at the same target is a to-hit roll (design D1–D3), and add a doc comment naming the rule. Verify `npm run typecheck`.

## 2. Tests

- [x] 2.1 In `apps/web/test/boardEffects.test.ts`, under a `describe("... (KAN-76)")`, add cases that pass with `npm test --workspace=@vtt/web`:
  - To-hit then damage on the same pair: no strike.
  - Damage with no earlier roll: strike. The existing case should stay green.
  - To-hit on a different target, then damage: strike.
  - Damage, then damage: strike.
  - A player whose copy lacks the GM-only to-hit: strike.
  - A to-hit ruled Miss, then damage: no strike.

## 3. Checks

- [x] 3.1 In `npm run dev`, as GM with a second browser as a player: roll to hit, rule Hit, press Roll damage. Verify one strike on both screens. Then roll a damage-only named attack and verify it strikes.
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
