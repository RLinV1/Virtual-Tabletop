## Context

`RoomPage` gets `state` and `you` from `useRoomSnapshot`; the GM's `state` is the full, unfiltered room (`filterStateForViewer` returns it unchanged for the GM). The same function is pure and lives in `@vtt/shared`, so it can run in the browser. `BoardView.redrawFog` already branches on the viewer's role.

## Goals / Non-Goals

**Goals:** a faithful player preview with no server work; keep invariants 3 (filtering) and 7 (server decides authorization); give the GM control over fog tint on their own view.
**Non-Goals:** acting as a player; new protocol.

## Decisions

1. **Derive, don't fetch.** `viewState = viewAs ? filterStateForViewer(state, participants[viewAs]) : state` in `RoomPage`, memoised on `state` and `viewAs`. Rejected: asking the server for a player snapshot, which needs a new GM-only endpoint and a protocol change for something the shared pure filter already computes.
2. **Render with a substitute viewer.** `Board` and `RoomPanel` receive `viewState` and the chosen participant as `you`. Role-based UI (`can.*`, fog drawing, GM sections) then follows the player automatically. The real connection and the GM's own `you` stay available for the banner and the exit button.
3. **Read-only by construction.** A `preview` flag disables `Board` input handling (tools, drag, placement) and marks the panel region `inert`. The banner stays outside the inert region. As a backstop, the connection's `command` is wrapped while previewing so it rejects locally with "Previewing as <name>". Commands that did reach the server would be authorized as the GM, so this is UX safety rather than the security boundary.
4. **Picker.** The participants control gains a "View as" action per active player, for the GM only. If the viewed participant leaves, the view returns to the GM.
5. **Fog opacity.** `FOG_GM_ALPHA` is 0.5 with the existing outline. The preview passes a player as `you`, so `redrawFog` draws it opaque with no extra code.
6. **Fog toggle.** `BoardView.setGmFogShown(false)` skips the fog fill for the GM and dims the outline to 40%. `Board` holds the choice in `usePersistentState("vtt.ui.gmFog")`, passes it to the view on every change and at view creation, and shows the toolbar button only to the GM when fog exists. It is a per-browser UI preference like sidebar collapse, never room state.
7. **Live updates.** The derivation is memoised on the GM's live `state`, so the preview updates as the room changes, matching what the player would see after the server's own filtering.
8. **Fidelity caveat.** The server also filters events and sends resyncs; filtering the full state on the client is equivalent for state-derived UI, but ephemeral relays shown to the GM are not re-filtered. Acceptable for a preview.

## Risks / Trade-offs

- **Client and server filtering diverge:** both call the same shared function; a unit test asserts the preview equals `filterStateForViewer` output.
- **Accidental commands from player-styled controls:** inert region plus a rejecting `command` wrapper.
- **Re-render cost on every state change:** the filter is O(tokens + rolls) and memoised.

## Migration Plan

Client-only, no flag. Rollback is reverting the change.

## Open Questions

- Should the GM be able to preview a participant who is currently disconnected? Assumed yes, since their view depends only on role and ownership.
