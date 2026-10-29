## Why

FR-GM-19 asks for player-specific 2D line of sight from walls and portals. Today walls and portals block movement only; a player sees every token outside manual fog, even one in a sealed room on the far side of the map. Walls (ADR 0029) and portals (ADR 0030) now exist, so the data line of sight depends on is in place.

## What Changes

- The GM can turn line of sight on or off for a room. It is off by default, so existing rooms behave as today.
- With it on, a player sees only what their own tokens can see: sight is cast from each owned token's centre and stops at plain walls and at closed or locked doors. Open doors and all windows let sight through. There is no range limit here; the `map-editor-sight-step` change adds an optional room sight range.
- Tokens, other players' area templates and portals outside a player's sight are never sent to that player, in snapshots, live events or ephemeral relays — the same guarantee fog gives (FR-GM-23). Fog still applies on top of sight.
- A player's board darkens everything outside their sight. A player who owns no visible token sees a dark board.
- Sight is not remembered: an area goes dark again when no owned token can see it.
- The GM's board is unchanged apart from the toggle. Viewing the room as a player shows that player's sight.
- Plain walls stay GM-only. A player receives the outline of what they can see, never the wall list.

Non-goals (README FR-GM-19 scope limits): light sources, darkvision, per-token sight range (a room-wide range comes with `map-editor-sight-step`), soft shadows, coloured light, elevation, and remembered ("explored") areas.

## Capabilities

### New Capabilities
- `line-of-sight`: the room toggle, how sight is cast from owned tokens through walls and portals, what a player may receive under it, and how the board shows it.

### Modified Capabilities
- `portals`: a player's state holds a portal only when it is outside fog and, with line of sight on, inside the player's sight.

## Impact

- `packages/shared`: new pure sight geometry; `Scene` gains an optional line-of-sight flag; new command `scene.setLineOfSight` and event `LineOfSightSet`; the visibility predicates and both filters take sight into account; the filtered player state carries that player's sight outline. These change existing schemas, so ADR 0044 is required, reviewed by the Real-Time Architecture owner.
- `apps/server`: the ephemeral relay uses the same concealment rule; more events cause a player resync while line of sight is on.
- `apps/web`: a GM toggle; the board draws a darkness mask from the sight outline.
- Tests: shared unit tests for geometry and filtering, a server integration test that hidden tokens never reach a player socket, and a Playwright check of the board.
