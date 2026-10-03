## Why

A GM controls exploration by deciding what the party can see. Without fog of war the whole map, and every token on it, is on every player's screen from the first second, so a GM can't run a dungeon crawl or keep an ambush secret. FR-GM-17 (KAN-28, moved to the Core Loop milestone) asks for manual fog: the GM conceals rectangular or polygonal regions, players see them masked, the GM sees them semi-transparent, and content under fog is never sent to players. Masking in Pixi alone would ship the hidden tokens to the browser (DESIGN.md §9, invariant 3), so the filter has to be server-side.

## What Changes

- Fog regions become room state: each one is a rectangle or a polygon in board coordinates.
- **New commands** (GM only):
  - `fog.add { shape: "rect", from, to }` or `fog.add { shape: "polygon", points }`.
  - `fog.remove { regionId }`.
- **New events:** `FogAdded { region }` and `FogRemoved { region }`. The removal event carries the whole region (invariant 6).
- **Visibility.** A token whose centre is under fog is withheld from players, in snapshots, events and ephemeral relays, exactly as a hidden token is. A player always keeps the tokens they own. A shared area template whose origin is under fog is withheld from every player except the one who placed it. Attack rolls blank a fogged side, and the turn order skips fogged tokens, through the existing filters. Fog regions themselves are sent to players, because they are the mask.
- **Undo.** Adding and removing fog are undoable from the activity log, so an accidental reveal can be taken back.
- **Board.** A GM-only **Fog** tool on the tool rail with three modes: Rectangle (drag), Polygon (click points, close on the first point or Enter) and Reveal (click a region to remove it). Players see fog as an opaque mask; the GM sees it semi-transparent with an outline.
- The activity log describes fog changes ("GM added a fog rectangle").
- **Contract change:** new commands, new events and a new `RoomState.fog` field, recorded in ADR 0016 for review by the Real-Time Architecture owner.

## Non-goals

- Dynamic line of sight, walls and portals (FR-GM-18, FR-GM-19).
- Hiding the map image pixels under fog. The map URL is already delivered; a fog mask is visual concealment of the picture, not secrecy of the image (FRONTEND-CONTRACT.md, visibility contract). Tokens and templates under fog are the protected content.
- Editing a placed region (remove and add again), brush-painted fog, "fog everything" presets.
- Partial overlap: a token is fogged by its centre point only.

## Capabilities

### New Capabilities
- `fog-of-war`: adding, removing, seeing and undoing fog regions, and what fog withholds from players.

### Modified Capabilities
- None in `openspec/specs`. The undo and area-template changes (not yet archived) are unaffected in shape; fog joins the reversible set.

## Impact

- `packages/shared`: `state.ts` (`FogRegion`, `MAX_FOG_REGIONS`, `RoomState.fog`), `geometry.ts` (`pointInPolygon`), `commands.ts`, `events.ts`, `decide.ts`, `reducer.ts`, `visibility.ts` (fog-aware filters plus `isInFog` / `concealedFrom`), `undo.ts`, `activityLog.ts`, plus unit tests.
- `apps/server`: `liveRoom.ts` relays drag previews only to viewers who may see the token; a new wire test.
- `apps/web`: `boardView.ts` fog layer and Fog tool gestures, `tools.ts`, `ToolRail.tsx` Fog flyout, `Board.tsx` wiring.
- `docs/adr/0016-manual-fog.md`, `docs/DESIGN.md` traceability (FR-GM-17 to built).
