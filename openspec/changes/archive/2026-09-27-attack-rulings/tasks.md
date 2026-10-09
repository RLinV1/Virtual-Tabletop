## 1. ADR

- [x] 1.1 Write `docs/adr/0011-attack-rulings.md` (Proposed; extends ADR 0010) covering:
  - `AttackContext.kind` and its default;
  - `DiceRoll.verdict` and `damageApplied`;
  - the `roll.rule` and `roll.applyDamage` commands and their checks;
  - the `RollRuled` (with `previous`) and `RollDamageApplied` events;
  - the two-event apply;
  - the visibility rules;
  - the deploy-together note.

  Verify the file exists and links this change. Ask the Real-Time Architecture owner to review it.

## 2. Contract (packages/shared)

- [x] 2.1 Schemas:
  - in `dice.ts`, `AttackKind`, `AttackContext.kind` (default `toHit`), `Verdict`, `DiceRoll.verdict?` and `DiceRoll.damageApplied?`;
  - in `commands.ts`, `dice.roll.attack.kind?`, `roll.rule { rollId, verdict | null }` and `roll.applyDamage { rollId }`;
  - in `events.ts`, `RollRuled { rollId, verdict, previous }` and `RollDamageApplied { rollId, amount }`.

  Verify that `npm run typecheck` passes and that an old `DiceRolled` without `kind` parses as `toHit` (unit test).
- [x] 2.2 In `decide`, copy `kind` into `dice.roll`, and add `roll.rule` and `roll.applyDamage` with the checks in design Decisions 2 and 3. Apply emits `TokenStatsSet`, then `RollDamageApplied`. In `reduce`, set `verdict` and `damageApplied`, doing nothing when the roll is missing. Verify with `packages/shared/test/attackRulings.test.ts` (FR-TAC-09, FR-GM-22):
  - GM hit, miss, change and clear, each with `previous`;
  - a player is forbidden;
  - a roll outside the window is not_found;
  - a damage or plain roll is invalid to rule;
  - the same verdict again is invalid;
  - apply lowers HP by `max(0, total)`, floored at −999;
  - a second apply is invalid;
  - a to-hit roll is invalid to apply;
  - a target that is gone is not_found;
  - a target without HP is invalid.
- [x] 2.3 In `filterEventForViewer`, redact `RollRuled` and `RollDamageApplied` for players when their roll is GM-only or not in the state before the event. Verify in the same test file (FR-GM-23):
  - rulings on a GM-only roll are redacted;
  - rulings on a public roll pass and contain no token id or name;
  - applying to a hidden target redacts the `TokenStatsSet` and passes `RollDamageApplied`;
  - the player's state shows the verdict with hidden sides still null.
- [x] 2.4 In `formatAttackRoll`, add " · Hit", " · Miss" or " · Applied", and "damage" as the fallback label for an unlabelled damage roll. Add activity-log sentences for `RollRuled` (new, changed, cleared) and `RollDamageApplied`. Verify with unit tests covering each sentence and the "an earlier roll" fallback.

## 3. Server

- [x] 3.1 Add `apps/server/test/attackRulings.test.ts` with GM and player clients. Verify that:
  - a player's to-hit roll, ruled Hit by the GM, converges on all clients with `verdict: "hit"`;
  - a player's forged `roll.rule` or `roll.applyDamage` is forbidden;
  - apply lowers HP once and a second apply is refused;
  - a GM-only roll's ruling never appears in a player's raw traffic;
  - applying to a hidden target never sends its id, name or HP to players.

## 4. Web

- [x] 4.1 In `panels/attackRoll.ts`, add the optional `kind` on stored settings and saved attacks (missing reads as `toHit`), `pendingRulings(state)` and `damageAmount(roll)`. Verify with `apps/web/test/attackRoll.test.ts`:
  - old stored values without `kind` still validate;
  - pending lists only unruled to-hit rolls and unapplied damage rolls with an HP-tracking target, newest first, with AC or HP.
- [x] 4.2 In `AttackPanel`, add the To hit | Damage toggle, remembered in last-used settings and saved attacks, and the Roll button wording. Send `kind` with `dice.roll`. Verify in the browser that a Damage roll records `kind: "damage"` and a saved Damage attack restores the toggle after a reload.
- [x] 4.3 In `LatestAttack`, show the outcome ("Waiting for the GM", Hit, Miss, Applied). After a Hit, add **Roll damage**: switch to Damage, fill the first saved Damage attack for that token, keep the target, and don't roll. Verify in the browser with a GM and a player: the player sees Waiting, then Hit after the GM rules; Roll damage fills 1d8+3 against the same target.
- [x] 4.4 Add `panels/RulingsPanel.tsx`, rendered for the GM only at the top of the Play tab:
  - pending rows with AC or HP;
  - Hit, Miss and Apply −N sending `roll.rule` and `roll.applyDamage`;
  - inline refusals;
  - "Nothing to rule on." when empty.

  Verify in the browser that a ruled or applied roll leaves the list, Apply lowers Goblin's HP once, and players have no Rulings list.
- [x] 4.5 In `DicePanel`, show the verdict or Applied in `RollRow`. For the GM, add Hit/Miss toggles on to-hit attack rolls, where pressing the current verdict clears it. Verify in the browser that the GM can correct Hit to Miss from the Dice tab and both clients show the change.

## 5. Verification

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
- [x] 5.2 Run the `visibility-auditor` and `sync-reviewer` agents on the diff and resolve their findings before opening the PR. The PR title references FR-TAC-09 and FR-GM-22.
