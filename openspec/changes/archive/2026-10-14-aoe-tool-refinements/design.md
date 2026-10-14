# Design

## Context

See proposal.md for the motivation. How area templates work today:

- **Shared:**
  - `AreaTemplate` (`state.ts`) is `{ id, shape, origin, toward, size, width?, ownerId, gmOnly }`.
  - `template.place` (`commands.ts`) and the ephemeral `templatePreview` (`protocol.ts`) carry the same fields, minus `id` and `ownerId`.
  - `decide` copies them into `TemplatePlaced`, after the GM-only and 10-cell line-width checks.
  - The visibility filters drop a GM-only template from players entirely.
  - `liveRoom.ts` relays GM-only previews to GMs only.
- **Geometry is client-only:** `areaShape(shape, origin, toward, size, grid, width)` in `apps/web/src/board/tools.ts` turns stored fields into an outline. It's used for drawing and for the eraser's hit test (`hitMark`), never by the server. A box is drawn from `origin` (the middle of its near side) for `size` toward the aim.
- **Aiming and placing (`boardView.ts`):**
  - `areaFromGesture` builds the area. It snaps the press with `areaOrigin` (to half cells), sizes it with `areaSizeFromDrag` (the pointer on the far edge), and takes `width = tool.lineCells × unitsPerCell`.
  - `placeArea` sends `template.place`.
  - Areas are drawn in three places: my own area while aiming (around line 1427), someone else's aim preview (around line 773), and placed templates. Each picks `gmOnly ? GM_AREA_COLOR : AREA_COLOR`.
- **Toolbar:** `ToolRail.tsx` keeps `area: { shape, size, lineCells: 1 | 2, gmOnly }`, and the line width is a `<select>`.
- **PixiJS 8.21** has `FillPattern` (a repeating texture fill).

## Goals / Non-Goals

**Goals:**
- One color list, defined in shared, used by the server's check and the client's swatches.
- Old events, checkpoints and replays still parse, with no migration.
- All three drawing paths share one fill helper, so none of them can drift.

**Non-Goals:**
- Changing circles, cones or lines.
- Any change to the visibility filters or the relay. A template and a preview already travel whole, so their color is filtered with them.

## Decisions

### Color is a named list in shared, optional everywhere
`state.ts` adds:

```ts
export const AreaColor = z.enum(["red", "orange", "yellow", "green", "blue", "purple", "grey"]);
export const DEFAULT_AREA_COLOR = "orange";
```

`AreaTemplate`, `template.place` and `templatePreview.preview` each gain `color: AreaColor.optional()`.

- **Optional rather than defaulted:** events written before this change have no `color`. With `optional()`, they parse unchanged, replay identically, and `reduce` stays a plain copy. The client draws a missing color as `DEFAULT_AREA_COLOR`.
- **The server's check is the zod enum.** Commands and ephemeral payloads are already parsed at the boundary, so an unknown color fails parsing before `decide` runs, with no extra code. `decide` adds `...(command.color && { color: command.color })`, the same pattern as `width`.

*Alternative considered:* storing a hex value. Rejected: the server would have to validate arbitrary colors, and a later theme change couldn't adjust the shades.

### Shades live in the web app
`board/tools.ts` maps each name to a value used for both the fill and the outline: red `0xe74c3c`, orange `0xe67e22` (today's `AREA_COLOR`), yellow `0xf1c40f`, green `0x2ecc71`, blue `0x3498db`, purple `0x9b59b6` (today's `GM_AREA_COLOR`), grey `0x95a5a6`. Keeping the shades out of shared means they can be adjusted later without touching the contract. `AREA_COLOR` and `GM_AREA_COLOR` are removed.

### One fill helper, with GM-only hatching from a single tinted texture
`boardView.ts` gets `fillArea(g, color, gmOnly, alpha)`, which all three drawing paths call:

- **Public areas:** `g.fill({ color, alpha })`, as today.
- **GM-only areas:** a repeating texture fill tinted with `color`, at `alpha × 2.5`, using one striped texture made on first use (see the spike result below for why it isn't a `FillPattern`).
  - Its texture is a small canvas (e.g. 16×16) with white diagonal stripes on transparent, set to repeat.
  - The fill color tints the white stripes, so every color shares one texture.
  - The pattern's transform scales it so the stripes are about a quarter of a grid cell apart. That way they zoom with the map, and nothing is redrawn on zoom.
- **The solid outline** is unchanged: `stroke({ width: 2 * px, color })`.

Aim previews use the lower alpha they use today.

**Spike result (task 3.1):** a `FillPattern` can't be tinted. Pixi's `convertFillInputToFillStyle` sets `color = 0xffffff` for any `FillPattern` fill, so `{ fill: hatch, color }` comes out white. A `FillPattern` only does three things: it sets the texture's address mode to `repeat`, uses `textureSpace: "global"`, and passes its transform as `matrix`. So the board does those directly with a plain texture fill, `g.fill({ texture, matrix, textureSpace: "global", color, alpha })`, which keeps `color` as a tint.

Checked in the running app: a GM-only red circle shows red stripes, and every colour still shares one texture. The per-colour fallback isn't needed.

*Alternatives considered:* a dashed outline, outline only, or a "GM" label. The user chose hatching, which can be seen from a distance and doesn't rely on color.

### A square's origin is its centre
`areaShape` for `"box"` becomes:

```ts
const h = length / 2;
return { kind: "polygon", points: [at(-h, -h), at(h, -h), at(h, h), at(-h, h)] };
```

So the square is centred on `origin` and turned toward `toward`. Because geometry is client-only, this one function change moves every box, in live play, replays, checkpoints and eraser hit tests, at once and the same way for everyone. Nothing in the log is rewritten. ADR 0035 records the new meaning and supersedes ADR 0021's "centred on its origin's near edge". The `AreaTemplate.origin` doc comment changes to match.

`areaSizeFromDrag` takes the shape. For `"box"`, the distance counts twice: `side = 2 × distance`, snapped to whole cells (at least one) unless free. The pointer then sits on the middle of the square's far edge, as it does for the other shapes. A click still places the tool's chosen size, facing right.

The origin keeps snapping to half cells. A 5 ft square clicked on a cell centre covers exactly that cell, and a 10 ft square clicked on a corner covers the four cells around it. No snapping rule specific to squares is needed.

### Line width as a clamped number field
`lineCells: 1 | 2` becomes `lineCells: number`, in both `ToolRail`'s options and `BoardTool`. The control is a small component in `ToolRail.tsx` with a − button, an `<input type="number" min=1 max=10 step=1 inputMode="numeric">` and a + button. Typing edits a draft string. When the field loses focus or Enter is pressed, the value is rounded and clamped to 1–10, or set back to the last valid value if it's empty or invalid. The buttons step by 1 and are disabled at the limits.

The 1–10 range comes from `MAX_LINE_WIDTH_CELLS`, exported from shared, so the toolbar and the server can't disagree.

### Color in the toolbar and the gesture
`ToolRail` area options gain `color: AreaColor` (default `"orange"`). The swatches reuse the `tool-swatches` / `tool-swatch` markup and styles from Draw, with `aria-pressed`, and each swatch's `aria-label` is the color name.

`BoardTool`'s area variant and the `"area"` `Mark` gain `color`. `areaFromGesture` copies it, and so do `placeArea` and the aim preview sender, so all three drawing paths read it from the mark or the preview.

### Activity log
`templateLabel` puts the color before the size when one is set ("a red 20 ft circle"). An area with no color reads as before. This changes only the text, not the event.

## Risks / Trade-offs

- **Old squares move by half their side.** The user accepted this. The ADR says so explicitly, so it isn't mistaken for a bug. A checkpoint restored after this change shows its squares in the new position.
- **Tinting a pattern:** settled by the spike. A plain repeating texture fill is tinted, and a `FillPattern` isn't.
- **A yellow or grey area on a light map** is low contrast. The solid outline at 0.9 alpha keeps it visible, and white was dropped for this reason.
- **Contract change:** this needs ADR 0035 and review by the Real-Time Architecture owner before it merges. The change is only additive (optional fields), apart from the meaning of a box's origin.
- **Spec dependency:** the `area-templates` delta only applies after `kan-35-aoe-line-and-aim` is archived. Archive that first, or this change's archive will create the capability without kan-35's requirements.
