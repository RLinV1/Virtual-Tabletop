# ADR 0025 — Walls and automatic wall detection

**Status:** Proposed — needs review by the Real-Time Architecture owner · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0013-undo.md`, `docs/adr/0019-checkpoints.md`, `docs/adr/0012-grid-detection-http-contract.md`
**Change:** `openspec/changes/auto-wall-detection` · **Requirements:** FR-GM-11, the wall data model of FR-GM-09

## Context

A room has no wall geometry, so a token can be dropped inside a wall and dragged through solid rock. FR-GM-11 asks for walls inferred from the map image by an isolated vision service. DESIGN.md §1 and §2 already fix the service's shape: Python and OpenCV in its own container, "driven by a BullMQ queue on Redis". Grid detection (KAN-09, ADR 0012 there) added `services/vision` and BullMQ to the server, but its jobs are consumed by a Node worker that calls Python over HTTP.

Two constraints shape the contract:

- **The socket payload limit.** Socket.IO accepts at most 64 KB per message, and a detected map has hundreds of segments.
- **Fog.** Wall geometry inside fog describes rooms the players have not seen.

## Decision

### State

- `Wall = { id, a: Point, b: Point }` in board coordinates (invariant 8). A segment is the UVTT wall model, so portals (FR-GM-18) and line of sight (FR-GM-19) can build on it.
- `RoomState.walls: Record<Id, Wall>`, at most `MAX_WALLS` (1500).
- `TableState.walls` is optional, so checkpoints restore walls (ADR 0019). Tables in events written before walls existed omit it, and `reduce` reads that as no walls, which is what the board held then. `encounterTable` produces no walls.

### Commands (GM only)

- `wall.applyDetected { mapUrl }`. The segments come from `DecideContext.detectedWalls(mapUrl)`: the server reads the validated detection result for that room, as it reads `checkpointTable` and `encounterTemplate`. The command stays a few bytes. A client can't commit geometry the server did not validate. It is `invalid` unless `mapUrl` is the current map and a result exists. It replaces: `WallsRemoved` for the current walls, then `WallsAdded`.
- `wall.remove { wallIds }` (at most 500) and `wall.clear`.

### Events

- `WallsAdded { walls }` and `WallsRemoved { walls }`. Each carries whole walls (invariant 6) and is the other's inverse, so both are reversible (ADR 0013).
- `scene.setMap` to another URL appends `WallsRemoved` for every wall in the same batch, because walls describe one image.

### Blocking

- **Footprint.** The footprint is the token's square inset by 10% on each side. Creating, moving or repositioning a token so that a wall crosses its footprint is `invalid` ("That spot is blocked by a wall."), for everyone. The inset lets a token stand beside a wall drawn on a cell edge.
- **Crossing.** A player's `token.move` whose straight path crosses a wall is `invalid` ("A wall is in the way."). The GM is exempt from this check, so detection noise never strands a token.
- **Exemptions.** Grid re-snaps and resizes are not checked.
- **Multi-copy placement.** `spreadPositions` skips blocked squares.

### Visibility

Walls are GM-only:

- `filterStateForViewer` sends players `walls: {}`.
- `filterEventForViewer` redacts `WallsAdded` and `WallsRemoved` for players.
- A refusal reads the same whether or not the player could see the wall.

### Detection pipeline

1. **Producer.** The app server puts a job on the BullMQ queue `wall-detection`. The job data is the image bytes, read by the server-owned object key (`AssetStore.readPrivate`), plus the image size. The worker never fetches a URL.
2. **Consumer.** `services/vision/wall_worker.py` uses the `bullmq` Python package, which shares the Node package's Lua scripts. It returns `{ walls, preview }`, where `preview` is a JPEG of the map with the walls drawn.
3. **Completion.** The app server's `QueueEvents` listener receives `completed` and `failed`. It validates the return value (zod: bounds, count, preview size) and keeps it in a bounded in-process store keyed by room and map. It then removes the job and sends `{ type: "wallDetection", mapUrl, status }` to the room's GM sockets only. That notice is not room data and gets no seq (invariant 4).
4. **Retrieval.** GM-only REST routes return the status and the preview bytes.
5. **No Redis.** The feature answers 503, and uploads and play are unaffected.

## Alternatives rejected

- **A client-sent segment list.** It exceeds the socket limit, and the server would commit geometry it never checked.
- **A REST route that writes walls.** It would bypass `decide` (invariant 1).
- **Players receiving walls.** It would leak fogged layout. Client-side pre-checks are not worth that.
- **A Node worker calling Python over HTTP**, as grid detection does. DESIGN.md names BullMQ as the vision service's driver, and a Python consumer keeps the CV container free of HTTP surface. Grid jobs can move to the same consumer later.
- **Results in Postgres.** They are unapplied suggestions, cheap to recompute, and nothing in the log refers to them.

## Consequences

- `RoomState` and `TableState` grow. Old snapshots and checkpoint events parse unchanged.
- The vision image now runs a second process, `vision-walls`, which needs `REDIS_URL`.
- A pending job holds up to about 34 MB of base64 in Redis. The age limits on jobs bound this.
- An app server restart drops unapplied results, and the GM re-runs detection.

## Amendment: hand-drawn walls and sampled detection (`openspec/changes/wall-editing`)

Detection on painted maps is noisy, and all-or-nothing results leave the GM stuck. Two additions:

- **`wall.add { walls }`** (GM only, at most 50, each `{ a, b }` on the map with two different
  ends, within `MAX_WALLS`) commits the existing `WallsAdded` event. Hand-drawn walls are then
  exactly like detected ones: GM-only, undoable, and blocking tokens. The board's Walls tool
  sends one segment per command, so each segment undoes on its own, and erases with the
  existing `wall.remove`. The activity log now reads "added N walls" for both.
- **`POST /wall-detection` takes `{ sample?: Point }`** (`WallDetectionRequest`, strict). A
  point outside the map is refused with 400. The sample travels in the job data, and the worker
  then builds its mask from the colour around that point (median Lab, fixed ΔE tolerance)
  instead of choosing between the bright and dark top-hats. Shape filtering is unchanged. This
  is the colour pick that both prior-art tools rely on, done at board zoom.

Nothing else changes: results stay suggestions until applied, and walls stay GM-only.
