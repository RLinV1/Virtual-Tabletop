## Why

`npm run dev` fills the terminal with 15-line `ws proxy socket error: Error: write ECONNABORTED` stack traces. Each one is the Vite dev proxy reporting that a Socket.IO connection was cut mid-write. That happens routinely when a tab is reloaded or closed, when HMR reloads the page, or when the dev server restarts. The client reconnects on its own, so nothing is wrong, but the noise hides real errors and keeps prompting "why do I keep getting this error".

## What Changes

- Give Vite a custom logger in `apps/web/vite.config.ts` that drops the WebSocket proxy messages (`ws proxy socket error`, `ws proxy error`) whose error code is `ECONNABORTED`, `ECONNRESET` or `EPIPE`.
- Every other log line still prints, including HTTP proxy errors (for example `ECONNREFUSED` when the API server is down) and WebSocket errors with any other code.

## Capabilities

### New Capabilities
- `dev-server-logging`: which dev-proxy errors are reported.

### Modified Capabilities
None.

## Impact

Dev tooling only: `apps/web/vite.config.ts` plus a unit test. There's no runtime or production effect; the production build doesn't use the Vite proxy.
