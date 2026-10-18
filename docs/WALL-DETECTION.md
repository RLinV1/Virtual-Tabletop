# Wall detection (FR-GM-11)

Decisions: [`adr/0029-walls-and-wall-detection.md`](adr/0029-walls-and-wall-detection.md).
Change: `openspec/changes/auto-wall-detection`.

## How it flows

1. The GM uploads a map, or presses **Detect walls** in the map editor's **Walls** step (Manage › Battle map › Edit map).
2. The app server reads the image from its own storage, stores the raw bytes once in the app's
   Redis under `vtt:wall-image:<sha256>` with an expiry, and adds a job to the BullMQ queue
   `wall-detection` that names that key, with the image's size and the room grid's cell size.
   A built-in library map (`/img/<name>`) is read from the web app's `apps/web/public/img`
   instead; a server deployed without that folder can't analyze built-in maps.
3. `services/vision/wall_worker.py` takes the job, runs `walls.py`, and returns the wall
   segments and a rendered preview (the map with the walls drawn in orange).
4. The app server hears the job finish from BullMQ's queue events, validates the result, and
   sends the room's GM a `wallDetection` notice. The Walls step then shows the preview.
5. **Apply walls** commits them with `wall.applyDetected`. From then on a token can't be placed
   across a wall, and a player can't move a token through one. Walls are GM-only, and
   **Clear walls** or undo removes them.

Nothing reaches the table until the GM applies. A result is a suggestion held by the app
server, so a server restart drops it, and the GM runs detection again.

## The map editor (map-editor, wall-editing)

Manage › Battle map › **Edit map** opens a full-screen editor with its own HUD and three steps:
**Map** (upload or library), **Grid**, and **Walls**. The Walls step shows the map with its walls,
and the side panel holds the tools:

- **Draw**: click to start a wall, and click again to end it and start the next one. Ends snap
  to grid corners, or to an existing wall's end nearby; hold Alt to place freely. Enter, Esc or
  a right-click stops. Each segment is its own undoable action.
- **Erase**: the wall under the pointer turns red, and a click removes it.
- **Detect like this**: click on a wall in the map. Detection then uses that wall's colour
  instead of guessing between light and dark walls. On Hollowfrost Keep, a click on a castle
  wall gives the walls without the snowy-cliff noise of automatic mode.
- **Pan**: drag to move around. The wheel zooms, and Space-drag pans in any mode.
- **Automatic detection**: Detect walls, the preview, Apply or Replace walls, and Clear all walls.

## Without wall detection

The app runs without Redis or the vision worker. `GET /api/wall-detection/availability` reports
`{ available: false, reason }`, and the Walls step greys out Detect walls and Detect like this,
saying why. Drawing and erasing walls by hand still work. The worker proves it is running by
refreshing the Redis key `vtt:wall-worker:heartbeat` every 10 seconds; the key expires 30 seconds
after the worker stops.

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

On Windows, activate with `.venv\Scripts\python` instead; the worker ends on Ctrl+C there
(Windows event loops have no signal handlers, so it skips the clean shutdown).

## The learned wall model

Automatic detection (no style picked, no "Detect like this" click, no strictness set) uses a
small neural network when its file is present, and the rule-based detector below otherwise.

- **File:** `services/vision/models/walls.onnx` (about 98 MB, a ResNet-34 U-Net, 24M parameters).
  It runs on the CPU through OpenCV (`cv2.dnn`), so the worker needs no GPU and no extra
  packages beyond `requirements.txt`. A 2000 by 1500 px map takes about 15 seconds.
- **Docker:** the `Dockerfile` copies `models/` into the image, so
  `docker compose up -d redis vision-walls` runs with the model with no other change. If you
  delete the file, the worker falls back to the rule-based detector and the logs show it.
- **Without Docker:** the same steps as above; `wall_worker.py` loads `models/walls.onnx` next to
  `walls.py` the first time a job needs it. Check it loaded by detecting walls on a map and
  seeing walls that follow drawn walls rather than the grid.
- **How it works:** the map is rescaled to 32 pixels per grid square and read in 512 px tiles.
  The network predicts, per pixel, whether it lies on a wall's centreline. That mask is
  thinned, traced into straight segments, snapped to horizontal and vertical where the
  drawing is, and short pieces and doubled lines are removed. Walls on the map's border are
  never reported. Each wall carries a `confidence` (the mean model probability along it) for
  the GM's review step.
- **Cell size:** the model needs the room's grid. With no grid set, it uses the grid
  detector's guess, which costs accuracy on maps with no drawn grid.
- **Accuracy:** on maps from authors it never saw, about 77% of the true wall length is found
  and about 83% of what it reports is right. Ink and Dungeondraft maps are above 95%;
  dark painted maps are the weak spot (about 40% found). The GM reviews every result before
  applying it, and can draw or erase walls by hand.
- **Training:** the training scripts and data live in `services/vision/training/`, which is
  git-ignored (local only). `services/vision/training/STATE.md` explains how to rebuild the
  environment and retrain. Training needs a GPU; running the model does not.
- **Repo size:** the model is one 98 MB file, so each retrained model adds that much to the
  git history. Use Git LFS before replacing it often.

The worker logs one line per job, with the image size, the wall count and the time taken. It
never logs image contents or results. Without `REDIS_URL` the app server reports wall detection
as unavailable (503), and everything else works as before.

## Deploying it

- Run the `vision-walls` process with `REDIS_URL` pointing at the app's Redis. It needs no
  ports, no database and no storage credentials.
- Scale it with replicas, or with `WALL_WORKER_CONCURRENCY` (default 2).
- A job with no answer within ten minutes is reported to the GM as failed. A map image is
  stored once, as raw bytes, under a key made from its content, so the same map in two rooms
  is one copy. The server deletes it when the last job using it is done, and Redis expires it
  after eleven minutes if the server never does. At most four analyses run at once across the
  server; a fifth is refused with "Wall detection is busy. Try again in a minute."
- Deploy the app server and the vision worker together: an old worker cannot read the new job.

## The rule-based detector (used when there is no model, or a style is picked), and its limits

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
