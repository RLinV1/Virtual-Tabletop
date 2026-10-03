## Why

KAN-35 (FR-TAC-06) is partly delivered by `shared-aoe-templates` (ADR 0007): circle, cone and box templates snap to the grid, and placing one commits it to room state and the event log. Three of its four acceptance criteria are still open:

- **"Circle, cone, line, and box templates."** There is no line. `AreaShape` is `circle | cone | box`, and a test rejects `"line"` on purpose. ADR 0007 deferred it.
- **"Aiming/orienting is ephemeral (visible to others, not persisted)."** Not built. Only the person placing a template sees it while aiming. ADR 0007 named a `templatePreview` ephemeral message as the follow-up.
- **"The ephemeral/committed boundary is covered by tests."** Not possible until the preview exists.

Lines matter in 5e play: Lightning Bolt, a dragon's breath and Gust of Wind are all lines, and today a GM fakes them with a long thin box that cannot be aimed by its end.

## What Changes

- **Line shape.** `AreaShape` gains `"line"`. A line starts at its origin and runs toward the aim point. `size` is its length in grid units. A new optional `width` field (grid units, default one cell) covers 10 ft lines. Snapping follows the other shapes: the origin snaps to the nearest half cell and the length to whole cells, and Alt places freely.
- **Live aim preview.** A new ephemeral payload, `templatePreview { preview: { shape, origin, toward, size, width?, gmOnly } | null }`, is sent while the Area tool is dragging (through KAN-39's coalescing sender) and cleared with `null` on place or cancel. Other clients draw it as a dashed outline labelled with the sender's name, and it disappears by itself 1 s after the last update.
- **Server rules for the preview.** A preview with `gmOnly: true` is relayed to GMs only, and dropped if a player sends it. A preview whose origin is off the map, or sent with no map, is dropped. It is never persisted and never sequenced.
- **Tests for the boundary.** Integration tests prove a preview changes no state and takes no seq, that placing commits exactly one `TemplatePlaced`, and that a GM-only preview never reaches a player.
- Tool rail: "Line" joins the Area shape picker, plus a width toggle (1 or 2 cells) shown for lines.
- **Schema change** in `packages/shared` (`AreaShape`, `AreaTemplate.width`, `EphemeralPayload`): needs an ADR amending ADR 0007 and Real-Time Architecture owner review.

## Capabilities

### New Capabilities

- `area-templates`: line templates and shared aim previews. The capability's spec arrives with the unarchived `shared-aoe-templates` change. Archive that change first so this delta merges onto it.

### Modified Capabilities

None in `openspec/specs/` today (see above).

## Impact

- `packages/shared`: `state.ts` (`AreaShape`, `AreaTemplate.width`), `commands.ts` (`template.place` width), `protocol.ts` (`templatePreview`), `activityLog.ts` (line label).
- `apps/server/src/domain/liveRoom.ts`: relay rules for `templatePreview`.
- `apps/web/src/board/tools.ts` (line geometry), `boardView.ts` (send and draw previews), `Board.tsx`, `ui/ToolRail.tsx`.
- Tests in `packages/shared/test/areaTemplates.test.ts`, `apps/server/test/areaTemplates.test.ts`, `apps/web/test/boardTools.test.ts`.
- **Depends on KAN-39** for `connection.preview` (coalescing sender). Merge KAN-39 first.
- Owner is Antonio (KAN-35). Coordinate before starting; KAN-32 is in progress with them and touches the same board files.
