# Wall detection (FR-GM-11)

Decisions: [`adr/0025-walls-and-wall-detection.md`](adr/0025-walls-and-wall-detection.md).
Change: `openspec/changes/auto-wall-detection`.

## How it flows

1. The GM uploads a map, or presses **Detect walls** in the Manage tab's **Walls** section.
2. The app server reads the image from its own storage and adds a job to the BullMQ queue
   `wall-detection` on the app's Redis: the image bytes, its size, and the room grid's cell size.
3. `services/vision/wall_worker.py` takes the job, runs `walls.py`, and returns the wall
   segments and a rendered preview (the map with the walls drawn in orange).
4. The app server hears the job finish from BullMQ's queue events, validates the result, and
   sends the room's GM a `wallDetection` notice. The Walls section then shows the preview.
5. **Apply walls** commits them with `wall.applyDetected`. From then on a token can't be placed
   across a wall, and a player can't move a token through one. Walls are GM-only, and
   **Clear walls** or undo removes them.

Nothing reaches the table until the GM applies. A result is a suggestion held by the app
server, so a server restart drops it, and the GM runs detection again.

## Running it locally

```bash
docker compose up -d redis vision-walls
REDIS_URL=redis://localhost:6379 npm run dev
```

Without Docker, run the worker from a virtualenv:

```bash
cd services/vision
python -m venv .venv && .venv/bin/pip install -r requirements.txt
REDIS_URL=redis://localhost:6379 .venv/bin/python wall_worker.py
```

The worker logs one line per job, with the image size, the wall count and the time taken. It
never logs image contents or results. Without `REDIS_URL` the app server reports wall detection
as unavailable (503), and everything else works as before.

## Deploying it

- Run the `vision-walls` process with `REDIS_URL` pointing at the app's Redis. It needs no
  ports, no database and no storage credentials.
- Scale it with replicas, or with `WALL_WORKER_CONCURRENCY` (default 2).
- A job with no answer within ten minutes is reported to the GM as failed. Jobs are removed
  from Redis once answered, so map images don't linger there.

## What it finds, and its limits

The detector finds bands thinner than about one and a half grid squares that stand out from
their surroundings. That covers bright raised stone, using a white top-hat, and dark ink
walls, using a black top-hat. It keeps the long horizontal and vertical runs whose edges
follow a drawn outline, then traces their centrelines. Stair hatching and isolated scraps are
dropped. It works best when the room's grid is set, because every size is measured in squares;
on upload, before a grid exists, it uses the grid detector's guess.

Known limits:

- Diagonal and curved walls are mostly missed.
- Busy terrain, such as snowy cliffs or vines, can add false walls.
- Doors and windows are not told apart from walls (FR-GM-18).

The GM reviews every result on the preview before applying it.
