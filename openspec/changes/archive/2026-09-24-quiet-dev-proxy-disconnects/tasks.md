## 1. Logger

- [x] 1.1 In `apps/web/vite.config.ts`, export `isExpectedProxyDisconnect` and install a `customLogger` whose `error` skips expected ws proxy disconnects.
- [x] 1.2 Unit test the filter in `apps/web/test/devProxyLog.test.ts`.

## 2. Verification

- [x] 2.1 Manual: on a second dev server (port 5174), 8 reloads and 6 tab closes printed no ws disconnect traces; with the logger switched off, the same steps printed repeated `ws proxy error` and `ws proxy socket error` ECONNABORTED traces.
- [x] 2.2 `npx openspec validate quiet-dev-proxy-disconnects`, then `npm run lint && npm run typecheck && npm test`.
