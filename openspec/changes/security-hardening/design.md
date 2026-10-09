# Design

## Context

See proposal.md for why. The server already has two kinds of limiter:

- `RateLimiter` in `apps/server/src/identity/rateLimit.ts`: an in-memory fixed window keyed by a
  string. `accountLimits()` builds the sign-in and sign-up limiters; `buildApp` sweeps them every
  minute and exposes them as `app.limits` so tests can drive them on a fake clock.
- Sliding-window arrays in `apps/server/src/ws/socket.ts`, one per connection, for chat and dice-look
  changes.

Both are per process, which matches the single-instance deployment (ADR 0001 routes each room to one
instance).

## Goals / Non-Goals

**Goals:**
- Close each gap with the limiter the server already uses for the same kind of request.
- Keep every existing limit's numbers and messages; only who the count belongs to changes for chat
  and dice looks.

**Non-Goals:**
- Moving limiters to Redis. One app server is the deployment today.
- A general command rate limit, or restricting image URLs (see "Findings not fixed here").

## Decisions

### D1. Password change: failures per account

`accountLimits()` gains `passwordChangeFailuresPerUser: RateLimiter(10, 15 min)`, keyed by user id.
The route counts the attempt (`hit`) before verifying the current password, so a limited account
costs no hashing, and a successful change `reset`s it. Counting first, synchronously, matters: if
the count were checked first and a failure recorded only after the `await` on argon2, requests sent
at once would all pass the check before any failure was recorded. Sign-in had exactly that race
(`check` before, `hit` after); it now uses the same count-first, clear-on-success order. One request
at a time, both behave as before: 10 failures, then refusal. A refusal is
HTTP 429 with `Retry-After`, the same body as the sign-in refusal.

**Why per account, not per IP:** the caller is already authenticated, and the thing being guessed is
that account's password. Per IP would let a stolen cookie be tried from many addresses.

**Why 10 per 15 minutes:** the same budget as sign-in per email, so a stolen cookie gains nothing over
the sign-in form.

### D2. Invite joins: attempts per IP per room

`accountLimits()` gains `joinsPerIpPerRoom: RateLimiter(30, 15 min)`, and `registerRoutes` receives the
limits. The join route resolves the invite to a room first, then counts the attempt under
`join:<roomId>:<ip>`. Every attempt counts, accepted or refused, so a loop of refused names is bounded
too. A refusal is HTTP 429 with `Retry-After` and the message "Too many joins from this address. Try
again later."; it appends nothing and stores no credential. The join page shows that message and,
as for a full room, does not mark the name field invalid: the name is not the cause. An unknown invite still answers 404 and
counts nothing, so the limiter can't be used to learn which codes exist.

**Why per room:** a room's log is what a join loop grows. Keying by room means people at one address
(a LAN party behind one NAT) joining different games do not share a budget.

**Why 30 per 15 minutes:** a full table is 32 players, but one address rarely holds more than a
household. 30 attempts leave room for typos in names and for leaving and rejoining, while bounding
growth to about 60 events per address per room per 15 minutes (each join plus its leave).

The `accountLimits` name stays: it is the server's set of HTTP limiters that `buildApp` sweeps.

### D3. Chat and dice looks: per participant across connections

`registerSocket` keeps the sliding-window arrays in a `WeakMap<LiveRoom, Map<participantId, number[]>>`
for each limit, instead of in each connection's closure. All of a participant's connections share one
array. A `WeakMap` keyed by the room means the counters go when the room is evicted (deleted) without
any cleanup code. The arrays are filtered to the window on every use, as now, so each holds at most
the limit's count of entries.

### D4. Production MinIO credentials

`createAssetStore` throws at startup when `NODE_ENV=production`, `MINIO_ENDPOINT` is set, and either
`MINIO_ACCESS_KEY` or `MINIO_SECRET_KEY` is missing. The error names both variables. Outside
production, unset credentials keep defaulting to the docker-compose values.

### D5. Proxy trust that clients can't forge

`trustProxyFromEnv` (in `app.ts`, now exported and taking the environment as a parameter for tests)
throws at startup when `NODE_ENV=production` and `TRUST_PROXY` is `true`, or is anything other than
a non-negative integer. The error tells the operator to set the number of proxies in front of the
server, for example `TRUST_PROXY=1` on Fly or Railway. With a hop count, Express takes the address
the nearest trusted proxy saw, so a client's own `X-Forwarded-For` entries are ignored.

Outside production, `true` still works, because local multi-person testing sometimes needs distinct
addresses, but it logs a warning. An unparseable value logs a warning and is ignored, as before.

**Why refuse instead of warn in production:** every per-address limit in this change, and the
existing sign-in and sign-up limits, depend on `req.ip`. A warning in a deploy log is easy to miss,
and the failure is silent: the limits look like they work and stop nothing.

## Risks / Trade-offs

- **Shared addresses:** a classroom behind one NAT joining one room could hit 30. → Each refusal says
  to try again later with `Retry-After`; a signed-in player can also resume an existing seat, which
  is not limited.
- **In-memory counters reset on restart.** → Acceptable for abuse limits; the same holds for the
  existing sign-in limits.

## Findings not fixed here

Recorded so they can be planned separately:

1. **Image URLs are free text.** `token.create`, `token.configure`, `token.setImage` and
   `scene.setMap` accept any URL up to 2048 characters (`MapImage.url`, `Token.imageUrl`). A GM can
   make every player's browser load an image from an outside host, which reveals their IP address to
   that host. `DiceFaceOnTable.url` already restricts to `/uploads/…`. Doing the same for maps and
   tokens (`/uploads/…` and the built-in `/img/…`) changes the `Command` schema, so it needs an ADR
   and the Real-Time Architecture owner's review.
2. **No general command rate limit.** Only chat and dice looks are limited. `token.move`,
   `participant.rename` and others append permanent events at whatever rate a client sends.
3. **Room uploads trust the declared type.** `/api/uploads` and `/api/library` accept a file by its
   declared MIME type. The file is served with that type (or one from its extension) and
   `X-Content-Type-Options: nosniff`, so a disguised file can't run in the app's origin, but a
   non-image can be stored. Dice pictures already check the real type with `image-size`.
4. **Token positions are unbounded.** `token.move` accepts any finite point, so a player can move
   their own token millions of pixels off the map.
