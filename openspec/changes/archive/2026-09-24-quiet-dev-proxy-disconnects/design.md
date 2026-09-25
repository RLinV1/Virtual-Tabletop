## Context

Vite's proxy (`vite/dist/node/chunks/config.js`) calls the user's `configure(proxy)` hook first and then adds its own `error` and `proxyReqWs` → `socket.on("error")` listeners, which log through `config.logger.error(msg, { error })`. Adding listeners in `configure` can't stop Vite's. Vite's documented `customLogger` option is the supported hook.

## Decisions

- `customLogger = createLogger()`, with `error` wrapped: skip the message when `isExpectedProxyDisconnect(msg, options.error)` holds, and otherwise pass it through unchanged.
- `isExpectedProxyDisconnect` is exported from `vite.config.ts` so it can be unit-tested. It requires both a WebSocket proxy message (`ws proxy`) and an expected code, so HTTP proxy failures and unfamiliar socket errors still show.

## Verification

- Unit (`apps/web/test/devProxyLog.test.ts`): suppresses `ECONNABORTED`/`ECONNRESET`/`EPIPE` on ws proxy messages; keeps `ECONNREFUSED`; keeps HTTP proxy errors with the same codes; keeps messages with no error.
- Manual: with `npm run dev`, reload and close a room tab a few times; no `ws proxy socket error` traces appear, and stopping the API server still logs `http proxy error`.
- `npm run lint && npm run typecheck && npm test`.
