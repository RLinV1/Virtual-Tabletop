## Why

Every area on the board is the same orange, so a table can't tell a fireball from a wall of ice at a glance. GM-only areas are marked only by being purple, so the cue depends on color alone. A line's width is a dropdown with only 1 or 2 squares, though the server already accepts up to 10. A square area is anchored on its near edge, but GMs and players expect to click the middle of the square they want covered (FR-TAC-06).

## What Changes

- **Area color:** the Area tool gets color swatches: red, orange, yellow, green, blue, purple and grey. Orange is the default.
  - The chosen color is part of the area. Everyone who can see the area sees it in that color, while it's being aimed and once placed. The activity log names it ("placed a red 20 ft circle").
  - The server accepts only these colors. An area with no color, including every area placed before this change, shows orange.
- **GM-only areas:** drawn with diagonal hatching in their chosen color, instead of being turned purple. Purple becomes an ordinary choice.
- **Line width:** the dropdown becomes a number field with − and + buttons, taking whole squares from 1 to 10. The server limit stays 10 squares.
- **BREAKING (stored data):** a square area's placed point is now its **centre**, not the middle of its near side. Aiming turns it around that centre, and dragging sets its side to twice the distance from the centre to the pointer. Squares already placed, including in replays and checkpoints, are redrawn centred on their stored point, so each moves by half its side. The table has accepted this.
- **Contract:** the area template, the place-area command, the area-placed event and the live aim preview each gain an optional `color` from a fixed list. A new ADR records the color field, how GM-only areas now look, and the new meaning of a square's placed point. That last part supersedes ADR 0021's description of a box.

## Non-goals

- Any color outside the fixed list, a color wheel, or changing an area's color after it's placed.
- A per-viewer color preference.
- Changing circles, cones or lines, or how any shape snaps.
- Changing the server's line-width limit.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `area-templates`: new requirements for area color, the GM-only hatching, the line width control, and square areas anchored on their centre. **Depends on `kan-35-aoe-line-and-aim` being archived first**: that change introduces this capability's spec, and it isn't in the main specs yet.

## Impact

- **`packages/shared`:**
  - `state.ts`: an `AreaColor` enum, plus the optional `color` on `AreaTemplate`. The doc comment for a box's origin changes to its centre.
  - `commands.ts`, `protocol.ts`: the optional `color`.
  - `decide.ts`: carries the color into `TemplatePlaced`.
  - `activityLog.ts`: names the color.
  - Tests in `packages/shared/test`.
- **`apps/server`:** no code change, because the relay and filters already handle templates whole. Add an integration test that a GM-only area's color never reaches a player.
- **`apps/web`:**
  - `ui/ToolRail.tsx`: color swatches, and the width number field with − and +.
  - `board/tools.ts`: the centred square, drag sizing, and the area tool options.
  - `board/boardView.ts`: the area's color, and a hatched fill for GM-only areas.
  - `board/Board.tsx`: sends the color.
  - Tests in `apps/web/test`.
- **`docs/adr/0035-area-color-and-square-centre.md`:** new, amending ADR 0007 and ADR 0021. It needs review by the Real-Time Architecture owner.
