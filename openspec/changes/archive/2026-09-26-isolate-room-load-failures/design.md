## Context

`RoomRegistry.get` returns the promise from `LiveRoom.load`. That promise rejects when `reduceAll` throws, for example `Unhandled event` from code that is older than the log it is reading. The registry already drops a rejected load from its map (`loading.catch(() => this.rooms.delete(roomId))`), so the next attempt loads again. What goes wrong is the callers:

- `io.use(async (socket, next) => …)` in `ws/socket.ts` awaits `store.findCredential`, `store.findRevokedCredential`, and `registry.get` without a try/catch. Socket.IO does not await middleware promises, so a rejection there is an unhandled rejection, and on Node ≥ 15 that ends the process.
- Every REST handler in `http/routes.ts` that reaches `registry.get` runs inside `void (async () => …)().catch(() => res.status(500)…)`. That includes `isRoomGm` and `authenticate`, which are only called from inside those wrappers. These handlers already fail only the one request, but they log nothing.
- `index.ts` has no process-level handler.

The Share control (`ui/ShareButton.tsx`) renders a Share button and a Reset link button side by side in the sidebar's `.panel-header`. The top bar (`RoomPage.tsx` `.room-topbar`) has `.topbar-end` with panel tabs, the activity log, and Guide. `ui/Popover.tsx` already provides an anchored `PopoverButton` with outside-click and Escape handling, used by the participants list.

## Goals / Non-Goals

**Goals:**
- No single room's data can crash the process through the handshake or REST paths.
- Every room-load failure is logged with the room id.
- The GM finds Share, and the way to clear the link, in the top-right corner, from one control.

**Non-Goals:**
- Making old server code understand newer events, for example by skipping unknown events during replay. Skipping would build state that is silently wrong, and `reduce` must stay total and deterministic.
- A new handshake error code or client screen for "room temporarily unavailable". See D2.
- Changing the invite reset endpoint or its semantics. "Clear" is the existing reset: the old code stops working and a new one is issued.

## Decisions

**D1 — Wrap the whole handshake middleware body, not only `registry.get`.** The credential lookups can reject too, for example on a Postgres outage, and they have the same crash path. One try/catch around the body calls `next(new Error("not_found"))` and logs `[vtt] room <roomId> failed to load: <err>`. The log uses `auth.data.roomId`, or `cred.roomId` once that is known. Logging is unconditional, not gated on `deps.logger`, because this is an operational fault, not request noise. Tests may see the line on stderr; that is acceptable. Alternative: only guard `registry.get`. Rejected because it leaves the same crash on other awaits.

**D2 — Reuse `not_found`, no new code.** The client (`net/roomConnection.ts`) treats `not_found` as terminal and shows "No access to this room". It does not forget credentials, since only `ended` does that. The worst case is that a user of a stale server sees a misleading screen and reloads once the server is updated. A dedicated `unavailable` code with client retry would be better UX, but it is a protocol addition that needs an ADR and review by the Real-Time Architecture owner. It can follow separately if wanted.

**D3 — Log in the REST `.catch` handlers, and log room ids in the registry.** The six `.catch(() => res.status(500)…)` calls become `.catch(internalError(req, res))`. That helper in `routes.ts` logs the method and the Express route *pattern*, then sends the same 500 body unless headers were already sent. It logs the pattern, not `req.path`, because a join URL carries the invite code, and codes stay out of logs (see room-access D6). The room id is logged once, centrally, where `RoomRegistry.get` forgets a failed load (`[vtt] room <id> failed to load: <err>`). This covers the socket and REST paths alike, including callers whose URL has no room id.

**D4 — `process.on("unhandledRejection")` logs and continues.** It goes in `index.ts` only, so tests and `buildApp` stay side-effect free. The handler is not added for `uncaughtException`: after a synchronous throw the process state is unknown, and crashing is still right there. The team agreed to this in the request; this design records it.

**D5 — The Share control is a split button in `.topbar-end`, rendered last.** The main button keeps the one-click copy, including its clipboard-in-gesture logic and generation guard. Next to it, a chevron button opens a `PopoverButton` panel (`align="right"`) with one action, "Reset link". That action opens the existing confirmation `Modal`. `PopoverButton` gains an optional render-prop `children(close)`, so the menu item closes the popover before the modal opens. Focus returns to Share when the modal closes. The `data-tour="share"` target moves with the control. Alternatives considered:
- Keep two separate buttons in the top bar. Rejected: they would crowd the bar, and the request asks for one control.
- Put reset in the GM panel tab. Rejected: the request asks for no separate tab.
- Make the popover the only entry, with copy inside it. Rejected: it would add a click to the common action and break the Safari gesture-copy rule.

In the phone layout (≤720px), the three-column top bar gave the right-hand controls too little room and they overlapped the participants. At that width `.topbar-end` moves to a second row that wraps, with Share still last and right-aligned.

## Risks / Trade-offs

- [A room with a poisoned log stays unusable until the server is upgraded] → Intended. The log line names the room so the team can find it. Nothing is rewritten, because the log is append-only (invariant 5).
- [Retrying the load on every reconnect costs a full replay per attempt] → Socket.IO backs off between reconnects, and a failed load is cheap relative to a crash. It is acceptable for now.
- [`unhandledRejection` logging could hide real bugs] → Each one is logged with its stack. This is a dev and student deployment, and staying up beats `tsx watch` sitting idle.
- [Moving Share changes the guided tour] → Update the `share` step text in `ui/guide.ts`, and check that its target resolves when the sidebar is collapsed.

## Migration Plan

This is a code-only change with no data migration. Roll back by reverting the commit.
