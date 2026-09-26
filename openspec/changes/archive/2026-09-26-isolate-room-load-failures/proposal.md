## Why

On 2026-09-25 one room took down the whole API server. The server was running code that did not know the `TemplatePlaced` event, while Postgres held rooms written by newer code. A browser reconnected to one of those rooms. `reduceAll` threw `Unhandled event` while `LiveRoom.load` was building the room, and the rejection escaped the Socket.IO handshake middleware in `apps/server/src/ws/socket.ts`, which has no try/catch. Node exited, `tsx watch` sat idle, and every `/api` request returned 500 through the Vite proxy. A room that cannot be loaded should cost one connection, not the whole table service.

While we are in the room shell: the GM's Share control sits in the sidebar header, out of sight when the sidebar is collapsed. It belongs in the top bar's top-right corner, where the other room-wide controls already are, with the "reset (clear) the link" action reachable from the same control instead of from a separate place.

## What Changes

- The socket handshake catches any failure to load the room. It logs the error with the room id and refuses that one connection with `not_found`. The server keeps running and keeps serving other rooms and `/health`.
- REST handlers that load a room (`POST /api/rooms`, invite join, uploads, invite read/reset, history) already turn a thrown error into HTTP 500 through their `.catch`. This change confirms that with a test and adds a log line so the failure is visible.
- `apps/server/src/index.ts` registers a `process.on("unhandledRejection")` logger, so any future escape is logged instead of killing the process.
- A failed load is not cached: the next connection or request tries to load the room again. This is the current `RoomRegistry` behavior and the change keeps it.
- The GM's Share control moves from the sidebar header to the right end of the room top bar. It becomes one control: the main button still copies the invite link in one click, and a small menu attached to it offers "Reset link", which clears the current link and makes a new one after a confirmation. There is no new panel tab and no separate button for resetting.
- The guided tour's "Invite players" step points at the new location and its text is updated.

No shared schema changes. No new handshake error code; the client already treats `not_found` as a terminal "no access" screen.

## Capabilities

### New Capabilities
- `room-load-isolation`: a room whose stored history cannot be loaded fails only the connection or request that asked for it; the server process and every other room keep working.

### Modified Capabilities
- `room-access`: "The GM manages access from the room UI" changes where the invite link and its reset action live: one Share control at the top right of the room, with reset in its menu.

## Impact

- `apps/server/src/ws/socket.ts`: try/catch around the handshake middleware body, with logging.
- `apps/server/src/http/routes.ts`: log room-load failures in the existing `.catch` handlers. The status codes stay the same.
- `apps/server/src/index.ts`: `unhandledRejection` logger.
- `apps/server/test/roomLoadFailure.test.ts` (new): an integration test with a poisoned `MemoryRoomStore` room.
- `apps/web/src/ui/ShareButton.tsx`, `apps/web/src/pages/RoomPage.tsx`, `apps/web/src/styles.css`, `apps/web/src/ui/guide.ts`: the Share control moves to the top bar, with reset in its menu.
- No changes to `packages/shared`, so no ADR is needed.
