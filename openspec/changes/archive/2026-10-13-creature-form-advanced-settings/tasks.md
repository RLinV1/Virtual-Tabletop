# Tasks

## 1. Creature form

- [x] 1.1 In `CreatureForm` (`apps/web/src/pages/LibraryCreatures.tsx`), take Starting HP out of the stat row and change the row to `token-setup-grid token-setup-grid-3` (Size, Max HP, AC). Verify by test 2.2.
- [x] 1.2 Add an "Advanced settings" `<details className="add-token-advanced">` after the Image field and before the error lines and buttons. It holds Starting HP with its "Leave Starting HP blank to start at Max HP." hint, Colour without art, and a nested `<details className="add-token-conditions" open={conditions.length > 0}>` titled "Starting conditions", listing the chosen condition labels as in Add Token, around `ConditionPicker`. Remove the old "Starts with" block. Verify by tests 2.2–2.3.
- [x] 1.3 Control the section's open state as in design.md: it starts open when the form opens with a Starting HP or any condition, opens when the Starting HP hint appears, syncs with `onToggle`, and never closes automatically. Verify by tests 2.3–2.4.
- [x] 1.4 Delete "Named to-hit and damage rolls are copied to each placed token." and "Without art it shows as a colour disc.". Verify that `grep -n "colour disc\|copied to each placed" apps/web/src/pages/LibraryCreatures.tsx` finds nothing.

## 2. Tests

- [x] 2.1 Run the existing `apps/web/test/creatureForm.test.tsx` unchanged and verify it passes. If its exact-markup match breaks, change only the expected markup, not what it checks.
- [x] 2.2 Add `apps/web/test/creatureFormAdvanced.test.tsx` (jsdom, `describe("creature form advanced settings (library-creatures)")`). A blank New creature has Size, Max HP and AC visible, the Advanced settings `<details>` is not `open`, and neither removed text is in the document. Verify with `npm test --workspace=@vtt/web -- creatureFormAdvanced`.
- [x] 2.3 In the same file, a prefill with `hp: 30, maxHp: 59, conditions: ["prone"]` renders Advanced settings open, Starting HP as 30, and a "Starting conditions: Prone" summary that is open. Then clearing Starting HP leaves the section open. Verify with the same command.
- [x] 2.4 In the same file, on a blank form, type a name, Max HP 10 and Starting HP 20 (via the closed section's input). Check that the section becomes open and "Starting HP cannot exceed Max HP." is shown. Then, with valid values, submit and check that `api.library.creatures.create` gets the same `hp`, `color` and `conditions` that were entered. Verify with the same command.

## 3. Wrap-up

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test` and verify all three pass.
