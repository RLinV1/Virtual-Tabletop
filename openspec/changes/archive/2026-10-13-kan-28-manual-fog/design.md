## Context

See proposal.md for motivation and specs/fog-of-war/spec.md for required behavior.

Current state that shapes the approach:

- `RoomState` is rebuilt on load by replaying the event log, so a new state field initialized in `emptyRoomState` needs no migration (as with `templates`, ADR 0007).
- Hidden tokens are the model for withheld content: `filterStateForViewer` drops them, and `filterEventForViewer` redacts their events or asks for a resync when a token becomes visible or invisible.
- `filterEventForViewer` receives the state *before* the event and the viewer. It cannot see the state after, so anything that depends on the result has to be computed from the event itself.
- `LiveRoom.relayEphemeral` skips drag previews of hidden tokens for players.
- Undo (ADR 0013) reverses a command's batch through `inverseOf`, with a conflict check per event type.

## Goals / Non-Goals

**Goals:**
- One rule decides whether a player may see a token, used by every filter and the relay.
- Fog changes go through the standard pipeline and are undoable.
- No player payload carries a token or template that sits under fog, unless the player owns it.

**Non-Goals:**
- Concealing the map image (see proposal Non-goals).
- Line of sight, walls, portals.

## Decisions

### D1. A region is a polygon; a rectangle is stored as its four corners

`FogRegion = { id, shape: "rect" | "polygon", points: Point[3..64] }`. `fog.add` for a rectangle takes two corners and `decide` normalises them into four points, so every reader (filters, renderer, hit testing) handles one geometry. `shape` is kept for the activity log and the UI. `decide` rejects a region with zero area (all points on a line, or a rectangle with no width), and a room holds at most `MAX_FOG_REGIONS` (100).

Alternatives: a separate rect schema (rejected: every consumer would branch); a fog bitmap / painted grid (rejected: large state, poor fit for the event log, and it does not follow a grid change).

### D2. "Concealed from the viewer" is one function

`concealedFrom(state, token, viewer)` is true when the viewer is a player and the token is hidden, or its centre is inside any fog region and the viewer does not own it. `filterStateForViewer` keeps only tokens not concealed from the viewer. Everything derived from the visible token map (initiative order, attack sides) follows. Templates are withheld when `gmOnly`, or when their origin is under fog and the viewer did not place them.

Owners keep their tokens: a player whose character walks into fog must still see and move it. The fog is drawn under the token layer, so their own token stays visible on top of the mask.

### D3. Events use before-and-after concealment

- `FogAdded` / `FogRemoved`: resync for players. A fog change can hide or reveal any number of tokens and templates, and a snapshot does both safely.
- `TokenMoved`: concealment before (from `before`) and after (same fog, `to`). Both concealed: redacted. Both visible: pass. Changed: resync.
- `TokenOwnersSet`: as above with the old and new owners, because gaining a fogged token reveals it.
- `TokenCreated`: redacted if concealed at its position. `TokenDeleted` and other token events: redacted if concealed before.
- `TemplatePlaced` / `TemplateRemoved`: redacted if the template is concealed under the `before` fog. Fog only changes through `FogAdded` / `FogRemoved`, which resync, so the `before` fog is the fog the player's state already reflects.
- Attack rolls use the same concealment for their sides.

### D4. Fog regions are sent to players

The region outlines are the mask the player's board draws. They say where the GM put fog, which the player sees anyway as black areas; they name no token. FRONTEND-CONTRACT.md asks for "a derived visible-area mask or equivalent safe projection"; the fogged polygons are that projection.

### D5. Drag previews follow concealment

`relayEphemeral` drops a `tokenDragPreview` for a viewer from whom the token is concealed, and for a viewer who doesn't own it when the preview point is under fog, so a GM dragging a visible token into fog does not draw its path through the hidden area.

### D6. Undo

`FogAdded` and `FogRemoved` join the reversible set. Their inverses are each other. Undoing an add is refused if the region is already gone; undoing a removal is refused if a region with that id exists again (it can't, ids are fresh, but the check keeps the rule "never clobber a newer change" uniform).

### D7. Board

- Layer order: map, grid, **fog**, tokens, marks, effects. A player's own token stays on top of fog; other players' tokens under fog are not in their state at all.
- Player: opaque fill. GM: the same colour at 50 % with an outline, so the GM sees the map, the region edges and the tokens inside.
- Fog tool (GM only): `{ kind: "fog", mode: "rect" | "polygon" | "reveal" }`. Rectangle: drag. Polygon: click vertices, close by clicking the first vertex or pressing Enter, Escape cancels, Backspace drops the last vertex. Reveal: click inside a region to remove the topmost one there.

## Risks / Trade-offs

- **Centre-point rule.** A large token half under fog shows if its centre is outside. Accepted; it matches how the server answers "where is this token".
- **Resync per fog change.** Each fog change sends players a snapshot. Fog changes are rare GM actions, so the cost is fine.
- **Old clients.** A client built before this change would throw on the new events. Accepted for a coordinated web + server deploy, as with every earlier event addition.
