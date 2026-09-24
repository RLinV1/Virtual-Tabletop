## Why

`ensureGmToken` (`apps/web/src/net/identity.ts`) returns any `vtt.gm` token already in `localStorage` without telling the server. If the server's store no longer knows that token's hash (the dev store switched from memory to Postgres, or the database was wiped with `docker compose down -v`), every route behind `withGm` (`apps/server/src/http/library.ts`) answers 401 "GM identity required". The dashboard, library, and in-room library picker then fail until the user clears site data, and clearing site data loses the token that owns their rooms.

## What Changes

- When a GM route answers 401, the web client re-registers the **stored** token with `POST /api/gm/identify` (already idempotent: `store.registerGm(hash)` upserts) and retries the request once.
- A second 401 after re-registering is shown to the user as an error. The client does not loop.
- The client never generates a replacement token during recovery. The existing token keeps ownership of any rooms and assets the server still has.
- Several GM requests that get a 401 at the same moment share one identify call.
- No server, protocol, or `packages/shared` schema changes. The server still answers 401 for unknown tokens.
- The web workspace gets a vitest runner so the recovery can be unit-tested. Today its `test` script is an `echo`.

## Capabilities

### New Capabilities
- `gm-identity-recovery`: How a browser with a stored GM token that the server does not recognise recovers without losing or replacing that token.

### Modified Capabilities
<!-- None. openspec/specs/ is empty. The GM device identity requirement lives in the in-flight
     gm-home-and-asset-library change; this change adds a separate capability instead of editing it. -->

## Impact

- **apps/web:** `src/net/api.ts` (`gmRequest` retry on 401, shared in-flight identify). `HomePage` Dashboard, `LibraryPage`, and `GmPanel` gain recovery through `api.gm.*` / `api.library.*` without changing their code. New `test/` directory, and `package.json` gets a `vitest` devDependency and `"test": "vitest run"`, so `package-lock.json` changes too.
- **apps/server:** no code changes. One integration test in `test/library.test.ts` checks the server contract the client relies on: a token the server has never seen gets 401, and after `identify` with that same token the same request succeeds.
- **Not in scope:** restoring rooms or assets lost in a wipe (they are gone with the data), real accounts (FR-GM-01), and any change to how a token is first created.
