# Tasks

## 1. Forms

- [x] 1.1 In `apps/web/src/pages/LibraryCreatures.tsx` (`CreatureForm`), replace the nested `<details className="add-token-conditions">` with the labelled `stack` group from design.md ("Starting conditions" label, `useId()` for `aria-labelledby`, then `ConditionPicker`), directly inside Advanced settings. Verify by test 2.1.
- [x] 1.2 Do the same in `apps/web/src/panels/AddToken.tsx`, keeping the `features.conditions` gate. Remove `conditionSpec` from either file's imports if nothing else uses it. Verify that `grep -rn "add-token-conditions" apps/web/src` finds nothing, and by test 2.2.

## 2. Tests

- [x] 2.1 In `apps/web/test/creatureFormAdvanced.test.tsx`, change the prefill test so that, with `conditions: ["prone"]`, the "Starting conditions" group is inside the open Advanced settings and its Prone checkbox is checked, with no `<details>` nested in Advanced settings. Add a check that on a blank form the group is inside the closed Advanced settings. Verify with `npm test --workspace=@vtt/web -- creatureFormAdvanced`.
- [x] 2.2 Add `apps/web/test/addTokenAdvanced.test.tsx` (jsdom, `describe("Add Token advanced settings (KAN-63)")`). Render `AddTokenButton` for a Free Mode room, open Add token, and check that the "Starting conditions" group is directly inside the closed Advanced settings `<details>` with no nested `<details>`. Then, with `presetOf` from `@vtt/shared` mocked to return features with `conditions: false` (Free Mode is the only preset today, and it has conditions on), check that no Starting conditions group is shown. Verify with `npm test --workspace=@vtt/web -- addTokenAdvanced`.

## 3. Wrap-up

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test` and verify all three pass.
