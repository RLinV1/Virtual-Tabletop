# Tasks

## 1. Server

- [x] 1.1 Password change guess limit (D1). Verify in `apps/server/test/accounts.test.ts`: after 10 wrong current passwords, the 11th attempt with the right one gets 429 with `Retry-After` and the password is unchanged; after the window passes it succeeds; a successful change clears the count.
- [x] 1.2 Invite join limit per IP per room (D2). Verify in `apps/server/test/joinRateLimit.test.ts`: 30 attempts pass, the 31st gets 429 with `Retry-After`, appends nothing and its token can't connect; another room from the same address is not affected; the window passing lets joins through again; an unknown invite still answers 404.
- [x] 1.3 Chat and dice-look limits per participant across connections (D3). Verify in `apps/server/test/chat.test.ts` and `apps/server/test/diceLooksOnTable.test.ts`: two connections on one credential share one budget.
- [x] 1.4 Production MinIO credentials (D4). Verify in `apps/server/test/assetStore.test.ts`: production with an endpoint and no keys refuses to start, naming both variables; with keys it connects; development without keys still connects.
- [x] 1.5 Join page: a 429 does not mark the name field invalid. Verify in `apps/web/test/roomPlayerCap.test.ts`.
- [x] 1.6 Count sign-in and password-change attempts before the password check, clearing on success (D1). Verify in `apps/server/test/accounts.test.ts`: a burst of 12 wrong guesses, for each, gets 10 checked and 2 refused with 429.
- [x] 1.7 Refuse `TRUST_PROXY=true` and non-numeric values in production; warn outside it (D5). Verify in `apps/server/test/trustProxy.test.ts`: production with `true` or `yes` refuses to start; a hop count is accepted; behind one proxy, 31 joins with forged `X-Forwarded-For` entries get 429 on the 31st (and the same test lets the 31st through when every proxy is trusted).

## 2. Finish

- [x] 2.1 Run `npm run lint && npm run typecheck && npm test`, and `openspec validate security-hardening --strict`. Verify all clean.
- [x] 2.2 Live check in the browser (Playwright): the join page shows the 429 message after the join limit is reached.
- [x] 2.3 Fix the Windows-only test flake found while verifying (not a product change): `startServer` listened on port 0, and Windows hands out ports from 1024, so a test server sometimes landed on one of `fetch`'s "bad ports" (e.g. 6000, 6666) and a random test failed with "fetch failed: bad port". `listenForFetch` in `apps/server/test/helpers.ts` listens again until the port is fetchable. Verify the server suite passes repeatedly on Windows.
