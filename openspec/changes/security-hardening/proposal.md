# Proposal

## Why

A security review of the server on 2026-10-08 found four places where a limit or a check that
exists elsewhere is missing:

1. **Password change has no guess limit.** `POST /api/auth/password` checks the current password
   with argon2 on every request and never counts failures. Someone holding a stolen session cookie
   can guess the current password without limit, which the sign-in limits (10 failures per email per
   15 minutes) were written to stop. Each guess also costs an argon2 hash, so a loop is a cheap way to
   load the server's CPU.
2. **Invite joins have no rate limit.** Anyone with an invite link can join, leave and join again
   without limit. The 32-player cap bounds seats held at once, not seats a room stores: each join and
   each leave is a permanent event, and every departed participant stays in the room state that every
   connection loads. The `room-player-cap` change named a per-address join limit as its follow-up.
3. **Chat and dice-look limits count per connection.** A participant who opens several sockets with
   the same credential gets 10 chat messages per 10 seconds on each, so the limit does not bound the
   permanent events one person can add to the log.
4. **Guess limits can be raced.** The sign-in limit per email checks the count before the password
   hash and records a failure only after it. Requests sent at once all pass the check before any
   failure is recorded, so a burst of 12 guesses gets 12 checked passwords, not 10.
5. **Production can run MinIO with the built-in credentials.** When `MINIO_ACCESS_KEY` and
   `MINIO_SECRET_KEY` are unset, the server connects with `vtt` / `vttvttvtt`, the docker-compose
   development values. In production that means a deployment can run against a MinIO left with
   publicly known root credentials without anyone noticing.

## What Changes

- **Password change:** at most 10 failed current-password checks per account in 15 minutes. Further
  attempts get HTTP 429 with `Retry-After` and do no password hashing. A successful change clears the
  count.
- **Sign-in and password change:** each attempt is counted before the password is checked, and the
  count is cleared on success. One at a time, this behaves as before. A burst gets at most 10
  password checks.
- **Invite joins:** at most 30 join attempts per IP address per room in 15 minutes. Further attempts
  get HTTP 429 with `Retry-After` and change nothing. The join page shows the server's message
  without marking the name field as the cause.
- **Chat and dice looks:** the existing limits (10 messages per 10 seconds; 10 look changes per
  minute) count per participant across all of that participant's connections to the room, not per
  connection.
- **MinIO in production:** with `NODE_ENV=production`, the server refuses to start unless
  `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are set. Development keeps the compose defaults.

**Not in this change** (recorded in design.md, "Findings not fixed here"):

- Token and map image URLs accept any string, so a GM can point players' browsers at an outside
  host. Restricting them changes the `Command` schema and needs an ADR.
- No general rate limit on commands such as `token.move` or `participant.rename`.
- Room uploads (`/api/uploads`, `/api/library`) trust the browser's declared image type; only dice
  pictures check the file's real type.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `user-accounts`: adds a guess limit on password change, and states that both guess limits hold
  for requests sent at once.
- `room-participants`: adds a per-address, per-room limit on invite joins.
- `room-chat`: the chat rate limit counts per participant, not per connection.
- `dice-looks`: the look-change limit counts per participant, not per connection.
- `upload-storage`: production requires explicit MinIO credentials.

## Impact

- `apps/server`: `identity/routes.ts` (limits), `http/routes.ts` (join limit), `app.ts` (passes the
  limits to the routes), `ws/socket.ts` (per-participant counters), `store/assetStore.ts`
  (production credential check).
- No change to `packages/shared` schemas, commands or events, so no ADR. No database migration.
- `apps/web`: `pages/joinFailure.ts` stops marking the name field invalid on a 429, as it already
  does for a full room. The message itself is the server's `error`, which the page already shows.
- Tests: `apps/server/test` (accounts, invite joins, chat, dice looks, asset store) and
  `apps/web/test/roomPlayerCap.test.ts`.
- `room-chat` and `dice-looks` are not in `openspec/specs/` yet (their changes are unarchived), so
  archive this change after `room-chat` and `shared-dice-looks`.
