## Why

KAN-59 requires map preparation to stay private until the GM applies it (FRONTEND-CONTRACT §13.2). Grid alignment already works that way: the grid editor is a GM-only draft with a local preview and one Apply (KAN-09, KAN-10, `room-grid-calibration`). **Map replacement does not.** In `apps/web/src/pages/GmPanel.tsx`, `MapSection` sends `scene.setMap` the moment an upload finishes or a library map is picked, and only then opens the grid editor. So:

- Players see the new, unaligned map while the GM is still lining up the grid, and a half-finished scene is broadcast as it is made.
- Replacing a map is two committed actions (`MapSet`, then `GridSet`), not one Apply.
- Cancelling grid setup after an upload leaves the new map live. There is no way back short of picking the old map again.

Two of the ticket's acceptance criteria hold today: the editor is a modal inside the room page, so opening it keeps the socket, and the shared `Modal` closes on Escape and returns focus to its opener. The other two ("a draft map is never visible to players before Apply", and "Apply is a single committed action; cancel discards the draft") do not.

## What Changes

- Upload and "From library" no longer commit anything. They open a **Prepare map** overlay holding a GM-local draft: the chosen image plus a grid draft (the library map's saved grid, or the current grid).
- The overlay reuses the existing grid editor (`GridForm` and `MapGridPreview`) against the draft image, in a wide sheet (max 1120 px, full viewport on mobile) rather than the side column.
- **Apply** sends one `scene.setMap { map, grid }`, which the contract already supports as one `MapSet` event (ADR 0004). Players see the old map until that moment, then the finished scene.
- **Cancel** or Escape discards the draft. Nothing is sent, and the live map is untouched. With unsaved alignment edits, Cancel asks "Discard changes?" first.
- "Adjust grid" for the live map keeps today's flow.
- No `packages/shared` change, and no server change.

## Capabilities

### New Capabilities

- `map-preparation`: replacing the battle map as a private draft that becomes visible only on Apply.

### Modified Capabilities

None. `room-grid-calibration` (editing the live grid) is unchanged.

## Impact

- `apps/web/src/pages/GmPanel.tsx` (`MapSection`): new draft state and the overlay; upload and library pick stop committing.
- `apps/web/src/pages/GridForm.tsx`: accepts a draft map and an Apply label ("Apply map").
- `apps/web/src/styles.css`: wide-sheet sizing for the overlay.
- Tests in `apps/web/test/` and one server-level check that players receive nothing during preparation.

## Non-goals

- Server-persisted drafts that survive a reload (FRONTEND-CONTRACT §13.2's longer plan). The ticket's acceptance criteria do not need them, and they need a new store and an ADR.
- Draft tokens placed before Apply. Hidden tokens already cover private token setup.
- Garbage-collecting uploaded images whose draft was cancelled. They stay recorded in `room_uploads` and are removed with the room (ADR 0009).
