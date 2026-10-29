## Context

See proposal.md for motivation and specs/line-of-sight for the required behaviour.

Current state that shapes the approach:

- Walls are straight segments in board coordinates (`Wall { a, b, portal? }`, ADR 0029). Plain walls are GM-only; players receive portal walls outside fog, stripped of import metadata (ADR 0030, ADR 0041).
- Every concealment decision for players goes through three predicates in `packages/shared/src/visibility.ts`: `concealedFrom` (tokens), `templateConcealedFrom` and `portalConcealedFrom`. Each takes `fog` as its first argument. They are used by `filterStateForViewer`, `filterEventForViewer`, the ephemeral relay in `apps/server/src/domain/liveRoom.ts`, and `decide` (a player may only toggle a portal they can see).
- `filterEventForViewer` decides per event: pass, redact (seq only), or resync (send a filtered snapshot). Fog changes and anything that may reveal or withdraw content already resync.
- "View as player" derives the player's state on the GM's client with the same `filterStateForViewer` (gm-view-as-player). The GM's client holds all walls, so it can compute any player's sight itself.
- `Scene = { map, grid }`. `TableState` (what checkpoints restore) includes `scene`.

## Goals / Non-Goals

**Goals:**
- One concealment rule that combines hidden, fog and sight, so filters, relay and `decide` cannot disagree.
- Sight computed on the server from GM-only walls; players receive only the resulting outline.
- No persisted derived data: sight is recomputed from state, never stored in events.

**Non-Goals:**
- Diff-style sight updates. A player whose sight may change gets a full filtered snapshot.
- Smooth or animated reveal on the board.
- Rendering sight for the GM's normal view (for example, per-token sight overlays).

## Decisions

### 1. Room flag on `Scene`, toggled by its own command

`Scene` gains `lineOfSight: z.boolean().optional()`; absent means off, so old events, snapshots and checkpoint tables parse unchanged. New command `scene.setLineOfSight { enabled }` (GM only, refuses a no-op) emits `LineOfSightSet { from, to }` (invariant 6). It is undoable through the existing compensating-event undo (ADR 0013) and gets an activity-log line. Because `scene` is part of `TableState`, checkpoint restore and replay carry the flag with no extra work.

*Alternative:* put the flag in a room settings object outside `Scene`. Rejected: checkpoints restore `TableState`, and a GM restoring a checkpoint expects the sight rule that went with that board.

### 2. Pure sight geometry in `packages/shared/src/sight.ts`

`sightPolygon(segments, origin, bounds): Point[]` returns the visibility polygon from one point. Blocking segments are plain walls plus portals whose state is `closed` or `locked` and whose kind is `door`. Windows and open doors never block (ADR 0030 anticipated this). `viewerSight` also adds the edges of every fog region as blocking segments, except fog regions containing the token's centre (a token standing in fog is not blinded by it); a point counts as in a fog region when inside it or within 1 board pixel of its edge, the same rule `isInFog` uses for concealment. Without this the polygon would outline the plain walls under fog, geometry players must never get (ADR 0029). `bounds` is the map rectangle; with no map the room has nothing to see and sight is empty.

`viewerSight(state, viewer): Point[][] | null` returns `null` when the viewer is the GM or line of sight is off (no limit), otherwise one polygon per owned, non-hidden token. "In sight" means inside any polygon, with points within 1 board pixel of a polygon edge counting as inside, so a door the token is looking at (whose midpoint lies on the sight edge) is visible.

Algorithm: angular sweep — cast rays to each segment endpoint the origin can see (never to hidden ones) and at ±a small angle on either side, find the nearest hit, sort by angle. Pure and deterministic (invariant 2). Budget: 1500 walls (`MAX_WALLS`) and one origin in under 5 ms in Node. The test gates at 15 ms, since it runs beside other test files on shared CI cores; that still catches the ~25 ms unbucketed scan. If the plain O(rays × walls) version misses the budget, prune segments by bounding box before switching algorithms.

*Alternative:* compute sight on the client. Rejected: the client would need the plain walls, which ADR 0029 keeps GM-only.

### 3. One concealment context replaces the `fog` argument

Introduce `type Concealment = { fog: RoomState["fog"]; sight: Point[][] | null }` and `concealmentFor(state, viewer)`. `concealedFrom`, `templateConcealedFrom` and `portalConcealedFrom` take a `Concealment` instead of `fog`, and conceal anything not owned whose reference point (token centre, template origin, portal midpoint) is outside sight. Callers build the context once per viewer, so sight is computed once per filter call, not per token.

`fogConcealsSide` stays fog-only. It is evaluated in `reduce`, which knows no viewer, and records whether an attack side is concealed for good. Sides naming tokens currently outside sight are still blanked through the visible-token map that `hideAttackSides` already uses.

*Alternative:* add a separate `outOfSight` predicate next to each existing one. Rejected: every call site would need both, and the first one to forget leaks.

### 4. The player's sight travels in the filtered state

`RoomState` gains an optional `sight?: Point[][]`. `reduce` never sets it; `filterStateForViewer` sets it for a player when line of sight is on. The welcome snapshot and view-as-player therefore both carry it with no protocol change. It is never persisted: the server's own state never has it, and events never carry it.

*Alternative:* a separate `sight` field on the welcome message. Rejected: view-as-player derives state locally with `filterStateForViewer`, and would need a second code path.

### 5. Event filter: resync whenever sight may change

While line of sight is on (checked on `before`, and also on the event for `LineOfSightSet`), a player is resynced on:

- `LineOfSightSet` (always, both directions);
- `WallsAdded`, `WallsRemoved`, `WallUpdated`, `PortalChanged`, `MapSet` — they can change any player's sight;
- `TokenMoved`, `TokenCreated`, `TokenDeleted`, `TokenOwnersSet`, `TokenHiddenSet` for a token the viewer owns before or after the event.

Every other event leaves sight unchanged, so its existing pass/redact/resync decision stays correct once it uses the `Concealment` built from `before`. In particular a non-owned `TokenMoved` keeps the `byVisibility` before/after comparison, now against sight as well as fog.

This keeps the invariant the client relies on: `state.sight` only changes through a snapshot.

### 6. Ephemeral relay uses the same rule

`relayEphemeral` builds each recipient's `Concealment` once per payload and uses the updated predicates. A drag preview of a token out of sight, or moved to a point out of sight, is dropped; the same holds for aim previews. Pings and dice drops are unchanged: they carry no hidden entity.

Sight per recipient is computed per relayed message. To keep drag previews cheap, `LiveRoom` caches each player's `Concealment` and clears the cache on every committed event.

### 7. Board: an inverse mask in `boardView.ts`

When `state.sight` is present, `boardView` draws an opaque dark layer over the map and grid with the sight polygons cut out, above tokens and below the fog clouds and UI. The GM's normal view has no `sight`, so it draws nothing. The tool rail gains a GM-only "Line of sight" toggle that sends `scene.setLineOfSight` through `RoomConnection.command`; while viewing as a player it sends nothing, as the Fog tool does.

### 8. ADR 0044

`Scene`, `RoomState`, the commands and events, and the visibility predicates are shared schemas. ADR 0044 records decisions 1–6, extends ADR 0016, 0029 and 0030, and needs review by the Real-Time Architecture owner before merge.

## Risks / Trade-offs

- [Every owned-token move resyncs that player] → Snapshots are already the fog path; the existing ephemeral latency benchmark plus a new integration test watch the cost. Upgrade to diff events only if a benchmark shows lag.
- [Wall or portal edits resync every player] → They happen during preparation, rarely in play.
- [Sight cost with 1500 walls and several players] → Unit-test budget (decision 2) and the relay cache (decision 6).
- [Precision at wall corners] → Ray offsets at ±ε plus the 1-pixel edge tolerance; corner, collinear and T-junction cases are unit tested.
- [Attack history] → A token deleted while outside a player's sight, never under fog, may show its name in an old roll after deletion, because `fogConcealsSide` cannot know per-viewer sight. Accepted for now; the token was public before line of sight existed.
- [Sight outline reveals room shape] → It shows only what the player's tokens can see, which is the point of the feature.

## Migration Plan

No data migration: `lineOfSight` is optional and absent means off. Rollback is to turn the toggle off; reverting the code leaves `LineOfSightSet` events in logs, so the reverted build must still parse them (keep the event in the schema if the feature is ever removed).
