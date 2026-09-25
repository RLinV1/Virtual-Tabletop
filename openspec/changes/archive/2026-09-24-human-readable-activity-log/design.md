## Context

See proposal.md for motivation and KAN-68. RoomStore already loads ordered append-only events for reconstruction; RoomState only retains 30 rolls. DomainEvent contains 16 variants. Movement references token IDs; deleted entities and renames are in history. REST currently authenticates uploads via room guest-token Bearer credentials. KAN-65 is merged into the current origin/main base (6e646aa); its native dialog and Roll history are reused.

## Goals / Non-Goals

**Goals:** Add a read-only history projection without mutating RoomState or extending existing schemas. Keep historical names correct and authorization on the server.

**Non-Goals:** Player history, history caching in RoomConnection, automatic live insertion, undo, fog events, persistent read-model migrations.

## Decisions

1. `GET /api/rooms/:roomId/history` uses a Bearer room credential, verifies credential room equality and authoritative participant role, and returns 403 without data for unauthorized callers. GM-only matches the README; player history would require additional temporal disclosure policy for later-hidden entities. Shared projection also fails closed for non-GMs. Every emitted event is passed through filterEventForViewer with its pre-event state; formatting context passes filterStateForViewer.
2. Add new HistoryQuery, ActivityLogEntry, and HistoryResponse Zod schemas. Query: optional exclusive `before` positive safe integer, `limit` 1..100 default 50, `player` trimmed substring up to 40 characters default empty. Response: entries containing committed event, actorName, sentence; nextBefore nullable. Unknown query fields are rejected. Existing schemas remain untouched, so no ADR for schema changes is needed.
3. Reuse loadEvents and replay chronologically through the pure reducer, filtering and formatting against pre-event state. A pure exhaustive formatter handles all variants; join events supply their own actor name, and room creation can resolve its actor from the subsequent join. Renames use the prior name; tokens deleted later are still present at their action's point in time. Apply case-insensitive actor search, reverse to descending order, and take limit plus one for the continuation cursor. Offset pagination would shift on new commits; seq cursors do not.
4. Use an on-demand modal with debounced server search, explicit Refresh, and Load older. Abort stale requests on search, close, and room changes. Display timestamps and a notice to refresh when newer seqs exist. Keep dice history untouched. Reuse the existing KAN-65 Modal and styles; put the GM Activity log button beside Participants in the board toolbar.

## Risks / Trade-offs

- Full log replay costs O(room history) per request, matching existing room-load reconstruction; response size is bounded. This avoids migrations and preserves historical labels. Large-room scale may later require a persisted, incrementally built projection or replay checkpoints, with the same API.
- GM-only endpoint is intentional. Do not remove its gate to enable players; temporal visibility needs a separate design. Fog has no event variant today; future variants must extend formatter exhaustiveness and visibility tests.
- Explicit refresh avoids racing live events with pagination; UI indicates when updates are available.
- Refreshing the base from origin/main brought in KAN-65 and the IPv4 Vite proxy fix; both are preserved.

## Migration Plan

No database migration or event rewrite. Deploy shared contracts and server route with the client; rollback by reverting these additive changes. Validate OpenSpec, lint, typecheck, shared unit tests and server integration tests. Postgres tests run when DATABASE_URL is configured.


