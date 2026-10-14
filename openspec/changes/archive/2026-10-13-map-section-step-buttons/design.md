# Design

## Context

`MapSection` in `apps/web/src/pages/GmPanel.tsx` owns the editor: `editorOpen`, `step` (`"map" | "grid" | "walls" | "fog"`), the draft map `prep` (`prepDirty`, `applyPrep`), and the walls/fog `draft` (`unsaved`, `saveDraft`, `discardDraft`). Grid edits to the room's current map live higher up in `RoomPage` as `gridDraft` / `hasGridDraft` and are applied with `onGridApply` (`parseGridDraft` turns a draft into a `GridSpec`). `MapSection` only receives `onGridClose`, which drops that draft. That is why `requestClose` can't ask about it today. Existing prompts are the `confirmSave` and `confirmDiscard` modals. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- One rule for unsaved work: any GM-initiated step switch, and closing, asks when the current step has changes.
- Reuse the existing save paths: `saveDraft`, `onGridApply`, `applyPrep`.

**Non-Goals:**
- Changing how drafts work (map-editor-drafts), what Save sends, or anything on the server.
- Separate editors per button (option B was rejected: it would split the shared draft and the Map, Grid and Walls flow).

## Decisions

- **Buttons set the step and open the editor.** One `openOn(step)` replaces the Edit map handler. The buttons sit in a `row button-row` that wraps, two per row in the sidebar. `data-tour="gm-grid"` moves to that row. `Modal` already returns focus to the button that opened it, so no extra code is needed for focus.
- **One pending-change check, worked out from the step being left:**
  ```
  pendingFor(from, to):
    prep && prepDirty(prep) && from in {map, grid} && to in {walls, fog}  -> "map"
    from == grid && gridDirty                                             -> "grid"
    from in {walls, fog} && unsaved                                       -> "draft"
    else                                                                  -> null
  ```
  `gridDirty` = `hasGridDraft` and the parsed draft is invalid or not `gridsEqual` to the room's grid, so a GM who changes a value and then changes it back isn't asked.
  - Walls and fog share one draft. Because every switch out of Walls or Fog asks, at most one step's edits are ever pending, so "Save" on that draft is what the GM expects.
- **One "Save changes?" prompt for switching and closing.** Generalise the existing `confirmSave` modal to hold `{ kind, then }`, where `then` is either "switch to step X" or "close":
  - Save runs the save for that kind (`saveDraft`, `onGridApply(parseGridDraft(...))`, or `applyPrep`). The modal closes and `then` runs only if the save succeeded. Otherwise the modal stays open and shows the error, as `confirmSave` does today.
  - Discard runs `discardDraft`, `onGridClose` or `discardPrep`, then `then`.
  - Keep editing closes the modal.
  - Save is disabled with the reason when the grid draft or the prep doesn't parse (`parseGridDraft` / `prepCommand` returns null).
  - The existing "Discard this map?" prompt on close is replaced by the same modal with `kind: "map"`, with wording adjusted per kind.
- **Only the tab clicks ask.** The tab `onClick` calls `requestStep(key)`. Code that changes the step itself (`setStep("grid")` after an upload or library pick, `setStep("walls")` after Apply map) keeps calling `setStep` directly.
- **Grid state reaches `MapSection` as props.** `GmPanel` already receives `gridDraft`, `hasGridDraft` and `onGridApply`, and passes them on together with the room's grid. Nothing changes in `RoomPage` or `RoomPanel`.

## Risks / Trade-offs

- [Applying the grid from the prompt skips the Grid form's own submit path] → Use the same `onGridApply` the form uses, with `parseGridDraft(draft, map)` exactly as `GridForm` computes `validDraft`, so the result is identical.
- [`requestClose` gains a fourth kind, and closing order matters] → Ask in this order: draft map, then grid, then walls/fog. Only one kind can be pending in practice, but a fixed order keeps it deterministic.
- [Tests that clicked "Edit map"] → Update `mapEditorWalls.test.tsx` to the new buttons. The fog tests can open the editor directly with Manage Fog.
