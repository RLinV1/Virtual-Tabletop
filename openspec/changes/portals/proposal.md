## Why

Walls (`auto-wall-detection`, `wall-editing`) block every token permanently, so a doorway drawn as a wall can never be walked through, and a doorway left open can never be shut. FR-GM-18 asks for doors and windows whose `Open`, `Closed` and `Locked` states the GM controls and players understand, and FR-GM-09 asks for walls to be designated as doors or windows. Walls now exist, so portals can build on them.

## What Changes

- **Portals.** A wall may carry a portal: `kind` is `door` or `window`, `state` is `open`, `closed` or `locked`. Closed and locked portals block tokens exactly like walls. Open ones don't.
- **New commands.**
  - `portal.set { wallId, portal | null }` (GM only): makes a wall a door or window with a given state, changes it, or turns it back into a plain wall.
  - `portal.setState { wallId, state }`: the GM may set any state. A player may open or close a portal they can see, but may not lock, unlock or open a locked one.
- **New event.** `PortalChanged { wallId, from, to }` carries the replaced value, is reversible, and reads in the activity log as "opened a door", "locked a window", "made a wall a door" and so on.
- **Players see portals.** Players receive portal walls whose midpoint is outside fog, never plain walls. Fog changes, wall changes and portal changes that reveal or withdraw a portal send the player a fresh filtered snapshot.
- **Map editor.** The Walls step gains a Door / window tool: pick Door, Window or Wall and a starting state, then click a wall. Like other wall edits it changes the editor's draft and reaches the room on Save; `wall.add` walls take an optional `portal` for that.
- **Board.** Doors and windows are drawn for everyone who can see them, styled by kind and state. The GM clicks one to open or close it and Shift-clicks to lock or unlock it. A player clicks a visible, unlocked portal to open or close it.
- **Contract change:** `Wall` gains an optional `portal` field, and there are two new commands and one new event. Recorded in a new ADR 0030; needs Real-Time Architecture owner review.

## Non-goals

- Line of sight and vision blocking (FR-GM-19). The portal `kind` is stored now so that windows can let sight through later.
- Requiring a token next to the door before a player may open it.
- Keys, lock-picking or per-player permissions for locked doors.
- Door art or animation beyond a distinct line style per kind and state.

## Capabilities

### New Capabilities
- `portals`: designating walls as doors or windows, their open, closed and locked states, who may change them, how they block movement, and what players see of them.

### Modified Capabilities
- None in `openspec/specs`. `auto-wall-detection` and `wall-editing` are not archived yet. Walls stay GM-only; this change adds portals on top of them.

## Impact

- `packages/shared`: `state.ts` (`Portal`, `Wall.portal`), `commands.ts`, `events.ts`, `decide.ts`, `reducer.ts`, `undo.ts`, `activityLog.ts`, `visibility.ts`, a new `portals.ts` for shared rules and wording, and unit tests.
- `apps/server`: no route changes. The command pipeline handles the new command types already. A multi-client integration test.
- `apps/web`: `pages/mapEditor/WallSetup.tsx` and `WallCanvas.tsx` (Door / window tool), `mapDraft.ts` and `draftConnection.ts` (portals in the draft and its Save), `board/boardView.ts` (draw portals for all viewers, click and Shift-click), `board/tools.ts` (portal hit test), `Board.tsx` wiring, `styles.css`, and the shared `can.togglePortal` hint.
- `docs/adr/0030-portals.md`.
