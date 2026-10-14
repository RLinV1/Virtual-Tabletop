# Design

## Context

Both forms render the same block inside `<details className="add-token-advanced">`:

```tsx
<details className="add-token-conditions" open={conditions.length > 0}>
  <summary>Starting conditions{...chosen labels}</summary>
  <ConditionPicker value={conditions} onChange={setConditions} />
</details>
```

In Add Token (`panels/AddToken.tsx`), it's gated by `features.conditions`. In the creature form (`pages/LibraryCreatures.tsx`), it's always shown. `add-token-conditions` has no CSS rules. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One level of disclosure: the conditions are visible whenever Advanced settings is open.

**Non-Goals:**
- Any change to when Advanced settings opens in either form, or to what is saved.

## Decisions

- **Replace the nested `<details>` with a labelled group,** the pattern the creature form used before (`stack` + `field-label`):
  ```tsx
  <div className="stack" role="group" aria-labelledby={id}>
    <span id={id} className="field-label">Starting conditions</span>
    <ConditionPicker value={conditions} onChange={setConditions} />
  </div>
  ```
  `role="group"` with the label keeps "Starting conditions" as the picker's accessible name now that there's no `<summary>`. `ConditionPicker`'s own `<fieldset>` legend stays "Conditions" for screen readers. The `id` comes from `useId()`.
- **Drop the chosen-conditions list from the label.** It existed so a *closed* nested section could still show what was chosen. Now the picker is visible whenever its label is, and its checked chips already show the choice.
  - *Rejected:* keeping "Starting conditions: Prone" as the label. It repeats what the chips show right below it.
- **Same markup in both forms.** Two small copies, matching the existing duplication of the Advanced settings block. Not worth a shared component.

## Risks / Trade-offs

- [In Add Token, a creature's conditions are filled in while Advanced settings is closed] → Unchanged from today: the outer section was already closed in that case (Add Token keeps its no-auto-open behaviour by the user's earlier decision), so nothing becomes more hidden than before.
