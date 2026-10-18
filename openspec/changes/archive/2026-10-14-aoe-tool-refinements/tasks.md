# Tasks

## 1. Decision record

- [ ] 1.1 Write `docs/adr/0040-area-color-and-square-centre.md`, amending ADR 0007 and ADR 0021. It covers:
  - the optional `AreaColor` on `AreaTemplate`, `template.place` and `templatePreview`, and orange for a missing color;
  - the change from purple to hatching for GM-only areas;
  - a box's `origin` now meaning its centre, superseding ADR 0021's "centred on its origin's near edge", and that existing squares shift by half their side.

  Link it from ADR 0021, request review by the Real-Time Architecture owner, and verify that the ADR file exists and is linked.

## 2. Shared contract

- [x] 2.1 In `packages/shared`:
  - add `AreaColor` and `DEFAULT_AREA_COLOR` to `state.ts`, and an optional `color` on `AreaTemplate`, with its origin comment changed to "a box's centre";
  - add an optional `color` to `template.place` in `commands.ts` and to `templatePreview.preview` in `protocol.ts`;
  - export `MAX_LINE_WIDTH_CELLS` if it isn't already exported.

  Verify `npm run typecheck`.
- [x] 2.2 In `decide.ts`, copy `color` into `TemplatePlaced` when present. In `activityLog.ts`, put the color in `templateLabel`. Add tests in `packages/shared/test` (`describe("area color (FR-TAC-06)")`) covering:
  - a red placement carries `color: "red"` into the event and the state;
  - a placement with no color has no `color`;
  - `"white"` or `"#ff0000"` fails to parse as a command and as a preview;
  - an old `TemplatePlaced` event without `color` still reduces;
  - the log reads "placed a red 20 ft circle".

  Verify that the tests pass.
- [x] 2.3 Add a server integration test (`apps/server/test`, referencing FR-TAC-06 and FR-GM-23): a GM places a GM-only green circle and aims one. The player client receives neither the template nor the preview, and a public red circle reaches the player with `color: "red"`. Verify that the test passes.

## 3. Board drawing

- [x] 3.1 Spike: in `boardView.ts`, build a 16×16 white diagonal-stripe canvas texture set to repeat, wrap it in a `FillPattern`, fill a test polygon with it tinted red, and check in the running app that the stripes come out red. Record the result in design.md: either the tinted pattern is confirmed, or switch to the per-color fallback.
- [x] 3.2 Add the color-name-to-shade map to `board/tools.ts`, plus `areaColorValue(color?: AreaColor)`, which returns orange when the color is missing. Remove `AREA_COLOR` and `GM_AREA_COLOR`. Add `fillArea(g, color, gmOnly, alpha)` to `boardView.ts`: a flat fill for public areas, the hatch pattern for GM-only ones, with stripes about a quarter cell apart. Use it in all three drawing paths. Verify with a test in `boardTools.test.ts` that `areaColorValue` maps every name and defaults to orange, and check in the running app that a public area and a GM-only area of the same color look different.
- [x] 3.3 Center the `"box"` shape in `areaShape`, and double the drag distance for a box in `areaSizeFromDrag` (it takes the shape). Update the box tests in `boardTools.test.ts`:
  - centred on the origin, turned toward the aim;
  - a 5 ft box on a cell centre covers that cell;
  - a drag of 1.5 cells gives 15 ft.

  Verify that the tests pass, and that the eraser still hits a box inside its new outline.

## 4. Toolbar

- [x] 4.1 Add `color: AreaColor` (default `"orange"`) to the area tool options and to `BoardTool`. Add color swatches to Area options in `ToolRail.tsx`, reusing the Draw swatch markup with `aria-pressed` and color-name labels. Carry the color through `areaFromGesture`, the `"area"` mark, `placeArea`, and the aim preview sender. Verify in the running app that a blue cone shows blue while aiming on a second client and once placed.
- [x] 4.2 Replace the line width `<select>` with a − / number / + control. `lineCells` becomes a number from 1 to `MAX_LINE_WIDTH_CELLS`. Rounding and clamping happen when the field loses focus or Enter is pressed; an empty entry goes back to the last valid value; the buttons are disabled at the limits. Add tests in `apps/web/test` (`describe("line width control (FR-TAC-06)")`) covering:
  - + three times from 1 gives 4;
  - typing 14 then Enter gives 10;
  - clearing the field and leaving it restores the previous value;
  - − is disabled at 1 and + at 10.

  Verify that the tests pass.

## 5. Verification

- [x] 5.1 In the running app, as the GM with a player in a second browser:
  - place a red circle, a GM-only red circle, a 4-square line, and a 10 ft square clicked on a cell corner;
  - check that the player sees only the public ones, in their colors;
  - check that the square covers the four cells around the corner;
  - check that the activity log names the colors.
- [x] 5.2 Run `npm run lint && npm run typecheck && npm test` and `openspec validate aoe-tool-refinements --strict`, and confirm both pass.
