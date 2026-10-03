## Context

ADR 0007 made placed templates room state: `AreaTemplate { id, shape, origin, toward, size, ownerId, gmOnly }`, with `template.place` and `template.remove`. The outline is derived on each client by `areaShape()` in `apps/web/src/board/tools.ts`, which already builds cones and boxes as polygons aimed along `toward - origin`. Aiming happens locally in `boardView.ts` during an Area gesture. `EphemeralPayload` has `ping`, `tokenDragPreview` and `diceDrop`. KAN-39 adds `connection.preview(key, payload)`, a coalescing sender with a trailing edge.

## Goals / Non-Goals

**Goals:**
- Line is a first-class shape with the same snapping, sync, visibility and undo as the others.
- Everyone sees aiming live, with GM-only aims kept from players.

**Non-Goals:**
- Editing or rotating a placed template (remove and place again, as today).
- Per-player visibility lists beyond GM-only.
- Showing which tokens a template covers.

## Decisions

### 1. Line as a polygon in the existing geometry
A line is a rectangle from `origin` along the aim direction: length `size`, width `width ?? unitsPerCell`, centred on the aim axis. `areaShape()` gains a `line` branch returning four points. It reuses the box branch's `at(along, across)` helper with half-width `w/2` instead of `length/2`.

*Alternative:* model a line as a thin box. Rejected: a box is a square of side `size`, so it cannot take a separate width, and its near edge is centred on the origin rather than the line starting at it.

### 2. `width` is optional on the template
`AreaTemplate.width?: number` (grid units, `> 0`, `≤ 10 × unitsPerCell`, validated in `decide` against the room grid). It is ignored for the other shapes. Optional, so every stored `TemplatePlaced` event still parses and replays unchanged, and `TemplateRemoved` already carries the whole template for undo.

*Alternative:* a fixed one-cell width. It is simpler, but it cannot express 10 ft lines, which are common enough (Gust of Wind, some breath weapons) to matter.

### 3. Preview payload carries the shape, not a template id
`templatePreview { preview: { shape, origin, toward, size, width?, gmOnly } | null }`. There is no id, because nothing has been placed yet. One preview per sender: the server and receivers key it by `from`. `null` clears it explicitly. Receivers also expire it 1 s after the last update, which covers a lost clear and a disconnect.

The client sends through `connection.preview("aim", ...)` so it is coalesced (≤20 per second, trailing edge kept), and sends `null` via `connection.ephemeral` after `cancelPreview("aim")` on place or cancel.

### 4. Relay rules live in `relayEphemeral`
They match what the relay already does for drag previews and dice drops:
- Drop it if `preview.gmOnly` and the sender is not GM.
- Drop it if `preview` is not null and `onMap(map, preview.origin)` fails.
- Deliver a `gmOnly` preview only to GM viewers.
- Use volatile delivery, like drag previews. A lost frame is replaced by the next one.

### 5. Drawing
Receivers draw a dashed outline with a low-alpha fill in the sender's colour, plus a small name label at the origin, on the existing overlay layer, using the same `areaShape()` as placed templates. The sender sees their own local aim exactly as today.

## Risks / Trade-offs

- [Schema change to `AreaShape` and `EphemeralPayload`] → Additive only. Old events still parse. Needs an ADR amending ADR 0007 and owner review.
- [An older client receives a `"line"` template] → Its zod parse fails on the new enum value. That is acceptable for a coordinated web and server deploy, as ADR 0007 already notes.
- [Merge conflicts with KAN-32] → Both touch `boardView.ts` pointer handlers and `protocol.ts`. Land KAN-39 first, then coordinate the order with Antonio.
- [Preview spam from a modified client] → The existing 40 per second per-connection ephemeral cap still applies.
