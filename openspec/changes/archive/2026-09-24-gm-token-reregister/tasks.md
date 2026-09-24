## 1. Web test runner

- [x] 1.1 Add `vitest` (`^3.2.7`) to `apps/web` devDependencies and set `"test": "vitest run"`. Run `npm install`, then verify `npm test --workspace=@vtt/web` runs (no test files yet is acceptable, or pass `--passWithNoTests`).

## 2. Client recovery

- [x] 2.1 In `apps/web/src/net/api.ts`, make `gmRequest` handle a 401 by calling `api.gm.identify(gmToken)` with the same token and re-sending `url` + `init` once. A second 401 or a failed identify throws the existing error message. Other statuses pass through unchanged. Add a comment that `init.body` must be resendable (string or FormData). Verify with `npm run typecheck`.
- [x] 2.2 Share in-flight identify calls per token (a `Map<string, Promise<void>>`, entry deleted when it settles). Verify with the concurrency case in 3.1.
- [x] 2.3 Update the `ensureGmToken` doc comment in `apps/web/src/net/identity.ts` to say that a stored token the server has forgotten is re-registered by `gmRequest`, not replaced. No behavior change. Verify by reading the diff.

## 3. Tests

- [x] 3.1 Add `apps/web/test/gmRecovery.test.ts` (`describe("GM token recovery (gm-identity-recovery)")`). Stub `fetch` with a fake server that starts with no registered tokens, and stub `localStorage` with a stored `vtt.gm` token. Cover: a stored but unregistered token recovers for `api.library.list` and `api.gm.rooms`; identify is sent with the stored token; the retry carries the stored token; `localStorage` is unchanged and `getGmToken()` returns the same token; a repeated 401 rejects after exactly one identify; a 404 sends no identify; two concurrent 401s send one identify. Verify with `npm test --workspace=@vtt/web`.
- [x] 3.2 In `apps/server/test/library.test.ts`, add a case where a token the server has never seen gets a 401 on `/api/library` and a 200 after `POST /api/gm/identify` with the same token. Add another where a room created with a token is still listed by `/api/gm/rooms` after that token is identified again. Verify with `npm test --workspace=@vtt/server -- -t "gm-identity-recovery"`.

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test`. All pass.
