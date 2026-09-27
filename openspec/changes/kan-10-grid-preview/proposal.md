# Proposal

## Why

The GM needs to align a room's grid to a battle map before players use it. KAN-10 adds a way to inspect manual corrections on the board before committing them, including after the room UI moved grid controls into the Battle map modal.

## What Changes

- The GM can edit cell size, grid offsets and distance per cell in **Battle map → Adjust grid**, with pixel nudges for size and offsets.
- Valid changes draw a distinct, GM-local grid preview over the current board. The room and player views keep the accepted grid until the GM applies it.
- Invalid or incomplete fields cannot be applied, including a cell size that would exceed the board's line limit. Cancel and modal dismissal discard the draft. A successful Apply commits one `scene.setGrid` command, while a rejection leaves the form open with its error.
- This is the manual alignment portion of FR-GM-04. The UI identifies its confidence as manual. Automatic detection and inferred confidence (FR-GM-03) remain future work.

## Capabilities

### New Capabilities

- `room-grid-calibration`: Manual correction, local preview, validation, cancellation and application of a room's active grid.

### Modified Capabilities

None. The existing canonical specs cover GM identity recovery and participant names. The separate in-progress `room-sidebar-layout` change owns the general modal and sidebar behavior.

## Impact

- `apps/web/src/pages/RoomPage.tsx`, `GmPanel.tsx`, `gridDraft.ts` and `panels/RoomPanel.tsx` own the draft and the Adjust grid flow.
- `apps/web/src/board/Board.tsx`, `boardView.ts`, `ui/Modal.tsx` and `styles.css` render the preview and keep the board visible beside the modal.
- The accepted grid still uses the existing `scene.setGrid` command and server authorization. The shared `GridSpec` now enforces canonical offsets for commands and library updates; malformed commands receive a matched rejection. No event, persistence or API shape change is required.
- A library map's saved grid can initialize the room grid; saving later corrections back to the library remains a separate explicit action owned by the asset-library change.
