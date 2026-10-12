# ADR 0032 — Atomic fog replacement

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-12 · **Extends:** `docs/adr/0016-manual-fog.md`, `docs/adr/0013-undo.md`, `docs/adr/0031-map-editor-command-context.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/atomic-fog-replace` · **Requirements:** FR-GM-17

## Context

The map editor saves a draft as separate `fog.add` and `fog.remove` commands. `fog.add` refuses at `MAX_FOG_REGIONS` (100), so a room at the limit cannot take a replacement even when the draft has no more regions than the room. A failure after some commands leaves the room half saved.

## Decision

- **Command:** `fog.replace { expectedMapUrl?, removeIds: Id[], add: Region[] }`, GM only. `add` regions use the same rectangle or polygon shapes as `fog.add`.
- **Events:** the existing `FogRemoved` (one per removed region, carrying the whole region) then `FogAdded` (one per new region). No new event, state field or visibility rule.
- **Validation:** every id in `removeIds` must exist (`not_found` otherwise), every added region needs some area, and `current - removed + added` must be at most `MAX_FOG_REGIONS`. Any failure emits no events.
- **Undo:** the events share the command's undo entry, so one undo reverses the swap. `undoConflict` now compares the fog count after the undo with the cap, instead of refusing whenever the room is full.
- **Save order:** the editor sends one `fog.replace` after wall and portal commands.

## Consequences

- Additive to the wire contract: old clients keep `fog.add` and `fog.remove`.
- Replay, the activity log and `filterEventForViewer` need no change because they see only existing events.
