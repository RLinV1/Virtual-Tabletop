## Context

See proposal.md (Why) and `specs/room-participants/spec.md` for the requirements. This section covers only the code facts that shape the approach.

- Joining does not go through `decide`. `POST /api/invites/:code/join` (`apps/server/src/http/routes.ts`) mints a participant id, calls `store.saveCredential`, and then calls `room.appendSystem([ParticipantJoined])`. `appendSystem` runs inside `LiveRoom.runExclusive`, the per-room ordered queue, but it does no validation.
- `participant.rename` goes through `decide` (`packages/shared/src/decide.ts`). The server calls `decide` inside the same queue, so the check runs against up-to-date state.
- `RoomState.participants` is a map with no "left" or "revoked" status. Revocation (FR-GM-20) exists only as `revokedAt` on the Postgres credential row, and it has no event. So the room itself cannot yet tell an active participant from an inactive one.
- A returning guest never re-submits the join form. `JoinPage` redirects to `/r/:roomId` when the browser already holds a credential (`guestRoomForInvite`), and the socket then authenticates with the stored token. Reconnecting creates no new join.
- `api.ts` throws `new Error(body.error)` for non-2xx responses, and `JoinPage` already renders that message in a `role="alert"` paragraph.

## Goals / Non-Goals

**Goals:**
- Run one pure, shared uniqueness rule for both join and rename, inside the room's ordered queue.
- Keep a race between two joins with the same name impossible, not just unlikely.

**Non-Goals:**
- Adding leave or revoke events to `RoomState`. That belongs to FR-GM-20/KAN-52.
- A rename UI. No web control sends `participant.rename` today. This change enforces the rule on the server only.
- Changing any zod schema or `RejectionCode`, or adding an ADR.
- Unique names across all rooms, or reserved names.

## Decisions

**D1. Put the join check in a pure `decideJoin` next to `decide`, not in a new `participant.join` command.**
`decideJoin(state, { id, role, displayName }) → Decision` returns `[ParticipantJoined]` or a rejection. `decide`'s `participant.rename` case and `decideJoin` share two helpers, `normalizeDisplayName(name)` (trim, then `toLocaleLowerCase("en-US")` for comparison) and `isDisplayNameTaken(state, name, exceptId?)`.
- *Alternative: add `participant.join` to the `Command` union.* Rejected. The union is also the socket protocol, so a connected client could send a join. It would also change an existing schema and need an ADR. Joining is an unauthenticated HTTP action with no actor yet, which does not fit `decide(state, actor, command)`.
- *Alternative: check in the route handler.* Rejected. The check would run outside the ordered queue, so two concurrent joins could both pass. It would also keep a domain rule out of `packages/shared`, against invariant 1.

**D2. `LiveRoom.join(participant)` runs `decideJoin` and commits in one `runExclusive` step.**
This matches how `command()` runs `decide` and `commit`, so the race scenario is handled by the existing queue with no locks or DB constraints. The route calls `room.join()` first and calls `store.saveCredential` only when the join succeeds.
- *Alternative: keep saving the credential first and delete it on rejection.* Rejected. The store has no delete operation, and a crash between the two steps would leave an orphan credential.
- *Trade-off:* a crash after the append but before `saveCredential` leaves a participant with no credential, so the name is taken with nobody able to use it. This is the lesser failure: it hides nothing, and once revocation events exist the GM can free the name.

**D3. A conflict uses the existing `invalid` rejection code and a clear message. The join route maps it to HTTP 409.**
`decideJoin` returns `{ ok: false, code: "invalid", message: 'The name "Raymond" is already taken in this room. Choose another name.' }`. A blank name also returns `invalid` with a different message. The route has to tell these apart for 409 versus 400, so `decideJoin` sets a small non-exported `reason: "name_taken" | "blank"` discriminator on its result. That field is server-side only and never crosses the wire, so the wire contract does not change. For rename, the socket `rejected` reply already carries `code` and `message`.
- *Alternative: add `"conflict"` to `RejectionCode`.* Rejected for now. It changes the contract, which needs an ADR and Real-Time Architecture review, and the web client does not branch on the code anyway.

**D4. "Active" means "present in `RoomState.participants`" until revocation becomes an event.**
`isDisplayNameTaken` checks participants through a single `isActive(p)` predicate that currently returns `true`. When KAN-52 adds a revoked or left marker, only that predicate changes. The "Revoked participant frees the name" scenario therefore cannot be tested until KAN-52 lands. Its task says so, and the predicate has a unit test so the hook exists.

**D5. Store names trimmed.** `decideJoin`, room creation and rename all put the trimmed name in the event. Case is kept as typed. Only the comparison ignores case.

**D6. `server-compose` launch configuration.** This is a copy of `server` with `DATABASE_URL`, `REDIS_URL` and `MINIO_ENDPOINT` set to the `docker-compose.yml` defaults. It lets the preview tooling run the app against real infrastructure. It is local dev tooling only, with no runtime effect. The `web` entry also sets `VTT_SERVER=http://127.0.0.1:3001`. The server binds IPv4 `0.0.0.0` only, and under the preview tooling Vite resolves `localhost` to IPv6 `::1`. Without this setting every proxied `/api` call fails with ECONNREFUSED and the browser gets a 500. The `server-compose` URLs use `127.0.0.1` for the same reason: on this machine a WSL relay listens on `::1` for 5432, 6379 and 9000, so `localhost` would reach the WSL services instead of the Docker containers.

## Risks / Trade-offs

- [Existing rooms already have duplicate names] → The rule only applies to new joins and renames. Existing events replay unchanged, because `reduce` does no validation. A participant who already shares a name can still rename to a free name.
- [Unicode look-alikes, such as Cyrillic "а" versus Latin "a", or NFC versus NFD forms, bypass the check] → Apply `normalize("NFC")` before comparing. Look-alike characters from different scripts are out of scope. This check is about telling people apart, not about security.
- [The GM cannot see which guest failed to join] → Accepted. The guest sees the message and retries, so the GM does not need to act.
- [No rename UI, so the rename rule is invisible to users] → The rule is tested at the shared and server level, so a later UI inherits it.

## Migration Plan

No data migration is needed. Deploy the server and the web client together. An older web client still shows the 409 `error` text through its existing error path. To roll back, revert the commit. The events written are the same as before.
