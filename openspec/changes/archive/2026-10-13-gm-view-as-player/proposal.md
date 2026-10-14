## Why

The GM controls what players can see (hidden tokens, fog, GM-only rolls) but has no way to check the result. They have to ask a player or open a second browser to confirm a hidden ambush is really hidden, or that a fogged room shows nothing. Meanwhile the GM's own board shows fog as a heavy overlay that makes the map under it hard to read.

## What Changes

- **View as player.** The GM can pick any player in the room and see the board and panels exactly as that player does: their tokens, fog, rolls, turn order and what is withheld. A banner names who is being viewed and offers one button to return to the GM view.
- **Client-only derivation.** The viewed state is computed on the GM's client by the existing pure `filterStateForViewer(state, player)` from the GM's full state, and the board and side panel are rendered with that state and that player as viewer. Nothing is requested from the server and nothing is sent as the player.
- **Read-only.** While viewing as a player the board tools, token drags and panel controls are inert. Commands are never sent as the player; if any were sent they would still be authorized as the GM on the server (invariant 7), so this is a safeguard against confusion, not a security boundary.
- **GM default view sees through fog.** The GM's normal view draws fog at 50% opacity with its outline, so the GM can see the map and every token beneath it. Players' fog stays fully opaque.
- **GM "see everything" toggle.** A "Fog on / Fog off" button on the board toolbar, shown to the GM when the room has fog, switches the fog tint off entirely (a faint outline remains to mark each region). This browser remembers the choice. It affects only the GM's own view.
- **No server or schema changes.** No new commands, events, state or persistence, so no ADR.

## Non-goals

- Acting as a player (rolling, moving their tokens) from the GM account.
- Reproducing ephemeral relays (pings, drag previews) exactly as a player would receive them.
- Previewing a guest who has not joined.

## Capabilities

### New Capabilities
- `gm-view-as-player`: the GM's player preview, its read-only guarantees, and the GM's fog visibility (default tint and the see-everything toggle).

### Modified Capabilities
<!-- None: no existing main spec covers GM-side view switching or fog opacity. -->

## Impact

- **`apps/web/src/pages/RoomPage.tsx`:** a `viewAs` participant id, derived `viewState` and `viewYou`, a banner, and inert markers on controls.
- **`apps/web/src/panels/` and `ui/`:** a "View as" action in the GM's participants control and a banner component.
- **`apps/web/src/board/boardView.ts` and `Board.tsx`:** GM fog opacity (`FOG_GM_ALPHA`, 0.5), the `setGmFogShown` toggle and its toolbar button (already implemented).
- **Tests:** vitest for the derivation (hidden tokens, fog and GM-only rolls withheld for the viewed player) and the inert state; Playwright check of switching and returning.
- **`packages/shared`, `apps/server`:** no change.
