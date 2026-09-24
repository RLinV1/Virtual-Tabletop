## Context

See proposal.md (Why). The relevant current behavior:

- `ensureGmToken` returns the stored token, and only calls identify when it mints a new token. Only `LibraryPage` and room creation go through it (`net/gm.ts` `getGmToken`).
- `HomePage` (Dashboard) and `GmPanel` read the token with `loadGmToken()` and call `api.gm.rooms` / `api.library.*` directly. A "re-identify inside `ensureGmToken`" fix would miss both of them.
- Every GM route call already goes through one function, `gmRequest` in `net/api.ts`.
- `POST /api/rooms` registers a provided `gmToken` itself (`routes.ts`, `registerGm`), so room creation already recovers.
- `registerGm` is an upsert in both stores, so the gmId stays stable for a hash the server knows.
- `apps/web` has no test runner. Its `test` script is an `echo`.

## Goals / Non-Goals

**Goals:** recovery for every current and future GM route with no changes in callers, and a unit test that exercises the real `api` module against a fake `fetch`.

**Non-Goals:** proactively re-identifying on every page load, server-side auto-registration of unknown tokens, and bringing back data lost in a wipe.

## Decisions

1. **Retry on 401 inside `gmRequest`, not once per page load.**
   On a 401, `gmRequest` calls `api.gm.identify(gmToken)` with the token it was given, then re-sends the same `url` + `init` once. If the retry gets a 401 again, or identify throws, the error goes through the existing `errorMessage` path.
   *Alternative:* re-identify once per page load in `ensureGmToken`. Rejected as the sole fix because Dashboard and GmPanel bypass it. Wrapping their `loadGmToken` reads would touch three pages and would still miss a store reset while the page is open. The 401 path costs nothing when the server is healthy, and it covers every GM route in one place.

2. **Share in-flight identify calls per token.** A module-level `Map<string, Promise<void>>` holds the pending identify for each token and deletes the entry when it settles. On a store reset, the library page's list and the in-room picker can get 401s at the same time. Without this they would each POST identify. That is harmless because identify is idempotent, but it is noisy.

3. **Retry only on 401.** 403, 404, 400, and 5xx pass through unchanged, so only "identity unknown" triggers recovery.

4. **Resending the request body.** Every GM call passes `init.body` as a JSON string or a `FormData`. Both can be sent again, so the retry reuses `init` as it is. A future caller that passes a one-shot stream body would break this. A comment on `gmRequest` states the constraint.

5. **Test with web vitest and a fake `fetch`.** Add `vitest` as a devDependency of `@vtt/web` (the version the other workspaces use, `^3.2.7`), use the node environment, and put the test at `apps/web/test/gmRecovery.test.ts`. The test stubs `globalThis.fetch` with a small fake server that knows a set of registered token hashes, or plain token strings, since hashing is not the point here. It starts empty, as after a wipe. The test calls `api.library.list(storedToken)` and `api.gm.rooms(storedToken)` and asserts:
   - The first call gets a 401, identify is POSTed with `{ gmToken: storedToken }`, the retry succeeds, and every request carried `storedToken`.
   - A fake that keeps returning 401 after identify makes the call reject after exactly one identify.
   - A 404 sends no identify.
   - Two concurrent calls send one identify.
   - `localStorage` (stubbed) still holds the same `vtt.gm` value, so no new token was minted.

   A server integration test in `apps/server/test/library.test.ts` pins down the contract the client depends on. A fresh token the server has never seen gets a 401 on `/api/library`. After `identify` with that same token, the request returns 200. Identifying the same token again keeps the same rooms: create a room with the token, re-identify, and `/api/gm/rooms` still lists the room.

## Risks / Trade-offs

- [A revoked token, once accounts exist, would silently re-register through this path] → FR-GM-01 replaces `resolveGm` with a session cookie, and `gmRequest` goes with it. This retry is scoped to the device-token era.
- [Anyone holding a token can register it] → Already true of `identify` today. Recovery sends nothing the client would not send on first use.
- [Adding vitest to the web workspace changes `package-lock.json`] → The package is already in the lockfile for the other workspaces, so the change is small.

## Migration Plan

Client-only change. Deploying it fixes browsers that are already stuck on their next GM request. Rollback is a revert with no data impact.
