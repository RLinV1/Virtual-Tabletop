## Context

Walls are GM-only room state (`RoomState.walls`, `Wall = { id, a, b }`), added and removed whole by `WallsAdded` / `WallsRemoved`, and they block token footprints and player paths in `decide` (ADR 0025). Players get `walls: {}` and every wall event redacted. The visibility layer already has a "resync" answer for changes that reveal or withdraw things, which fog and checkpoints use. The decision record for this change is `docs/adr/0026-portals.md`; this document summarises it and adds the client side.

## Goals / Non-Goals

**Goals:**
- One data model for walls and portals, so blocking, undo, checkpoints and wall removal keep working with no special cases.
- Players can see and use the doors in front of them without learning the layout of plain walls or anything under fog.

**Non-Goals:**
- Line of sight (FR-GM-19), proximity rules for opening doors, keys.

## Decisions

### D1. A portal is an optional field on `Wall`
`Wall` gains `portal?: { kind: "door" | "window", state: "open" | "closed" | "locked" }`. Old events and snapshots parse unchanged, and `WallsAdded` / `WallsRemoved` carry portals with the rest of the wall, so removing a door and undoing that brings the door back as it was.
*Alternative:* a separate `RoomState.portals` record keyed by wall id. It would need its own removal on `wall.remove`, `wall.clear`, `scene.setMap` and checkpoints, which is all cost.

### D2. Blocking is one predicate
`blocksMovement(wall)` is true for a plain wall and for a closed or locked portal. `decide` filters walls through it before the existing footprint and path checks. Windows block like doors for movement. The kind is stored for FR-GM-19 and drawing.

### D3. Two commands, one event
- `portal.set { wallId, portal: Portal | null }`: GM only, from the map editor. It designates, edits or clears.
- `portal.setState { wallId, state }`: from the board, for the GM and players.
- Both emit `PortalChanged { wallId, from: Portal | null, to: Portal | null }`. `from` is the replaced value (invariant 6). One event keeps `reduce`, undo and the visibility filter in one place; the activity log tells the cases apart from `from` and `to`.
*Alternative:* `PortalSet` and `PortalStateChanged`. The two would reduce, undo and filter identically.

### D4. Authorization order
`portal.setState` for a player: a `locked` target is forbidden first, before any lookup, so the refusal doesn't depend on the wall. Then the wall must exist, be a portal and be visible to that player, or the answer is `not_found` "portal" in all three cases. Then a locked portal answers "That door is locked." (or "window"). A no-op is invalid for everyone.

### D5. Visibility: portals outside fog
`portalConcealedFrom(fog, wall, viewer)`: never for the GM; always for a plain wall; otherwise when the wall's midpoint is under fog. `filterStateForViewer` keeps only unconcealed walls, so a player's `walls` holds exactly the portals they can see. `filterEventForViewer`:
- `WallsAdded` / `WallsRemoved`: resync when any wall in it is a visible portal, else redacted.
- `PortalChanged`: visible before and after, passed as-is; hidden both times, redacted; otherwise resync.
- Fog, checkpoint and encounter events already resync.

The refusal for a player's move through a door stays "A wall is in the way.", the same text as for a hidden wall.

### D6. Undo and activity log
`PortalChanged` joins the reversible set. The inverse swaps `from` and `to`. The conflict check refuses when the wall is gone or its portal no longer equals `to`. Wording comes from one helper in `portals.ts`, used by both `activityLog.ts` and `undo.ts`:
- same kind: "opened", "closed", "locked", "unlocked", "unlocked and opened", "closed and locked" + "a door" / "a window";
- from none: "made a wall a closed door";
- to none: "turned a door back into a wall";
- other kind: "made a door an open window".

### D7. Client
- **Map editor.** `WallCanvas` gets a `portal` mode. `WallSetup` shows Kind (Door, Window, Wall) and State (Closed, Open, Locked) pickers in that mode. A click picks the nearest wall with the existing `wallAt` hit test and sends `portal.set`, skipping the send when nothing would change. Portals draw in their own colours; open ones dashed.
- **Board.** `syncWalls` draws plain walls (GM only, as before) and portals for any viewer. A select-tool click on bare map first looks for a portal within a few screen pixels: if one is found and `can.togglePortal` allows it, the board calls `togglePortal(wallId, lock)` instead of clearing the selection. `Board.tsx` turns that into `portal.setState` and shows a refusal where it shows a refused move. The pointer becomes a hand over a usable portal.

## Risks / Trade-offs

- [A door at a fog edge may be visible while the room behind it is fogged] → It shows only that a door exists there, which the player could see on the map image anyway.
- [Players see "locked" before trying the door] → FR-GM-18 says players should understand the portal's state. The GM can leave a door closed and refuse it narratively.
- [Closing a door on a token that stands in the doorway] → Allowed. The existing rule ignores walls the token already stands across for its path, so it can step out.
- [Every portal designation on a fogged board resyncs players] → Designation happens during map setup, rarely during play.

## Migration Plan

No data migration. `portal` is optional, so existing logs and snapshots read as plain walls. Rollback: older code can't parse `PortalChanged` or the new commands, so roll back only before any room uses portals, as with any new event type.
