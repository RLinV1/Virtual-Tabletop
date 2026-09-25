# dev-server-logging Specification

## Purpose
TBD - created by archiving change quiet-dev-proxy-disconnects. Update Purpose after archive.

## Requirements

### Requirement: Expected WebSocket disconnects are not reported
The web dev server SHALL NOT log WebSocket proxy errors whose code is `ECONNABORTED`, `ECONNRESET` or `EPIPE`. It SHALL still log every other error, including HTTP proxy errors and WebSocket proxy errors with other codes.

#### Scenario: Reloading a room tab
- **WHEN** a room tab is reloaded while `npm run dev` is running
- **THEN** no `ws proxy socket error` stack trace is printed

#### Scenario: API server down
- **WHEN** the API server is stopped and the page makes an API request through the proxy
- **THEN** the `http proxy error` is still printed
