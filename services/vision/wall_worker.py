"""BullMQ consumer for wall detection (FR-GM-11, ADR 0029).

The app server produces jobs on the `wall-detection` queue in the app's Redis; this process
consumes them and returns `{walls, preview}` as the job's return value. The app server learns of
completion from BullMQ's queue events, validates the result, and notifies the room's GM.

Job data: `{ image: base64 bytes, width, height, cellSize, sample?, tolerance?, strictness?, minLength? }`, where
`sample` is a point on a wall the GM clicked, `tolerance` its colour range in Lab units, `strictness` the
share of a run's edge that must follow an outline, and `minLength` the shortest wall kept, in cells. The bytes were read by the app server
from its own storage; this worker never fetches a URL, and holds no database or storage credentials.
"""

import asyncio
import base64
import binascii
import os
import signal
import time

from bullmq import Worker
import redis.asyncio as aioredis

from walls import MAX_BYTES, OUTLINE_SHARE, SAMPLE_TOLERANCE, analyze

QUEUE = "wall-detection"
# The app server reads this key to know a worker is up (map-editor D4); it must match
# WALL_WORKER_HEARTBEAT in apps/server/src/domain/wallDetection.ts.
HEARTBEAT_KEY = "vtt:wall-worker:heartbeat"
HEARTBEAT_EVERY_S = 10
HEARTBEAT_TTL_S = 30
# Must match the SAMPLE_TOLERANCE_*, STRICTNESS_* and MIN_LENGTH_MAX constants in packages/shared/src/wallDetection.ts.
MIN_TOLERANCE = 10
MAX_TOLERANCE = 60
MIN_STRICTNESS = 0.2
MAX_STRICTNESS = 0.6
MAX_MIN_LENGTH = 6


async def process(job, _token=None) -> dict:
    """One job. Raises on bad input, which BullMQ records as the job's failure."""
    data = job.data or {}
    encoded = data.get("image")
    if not isinstance(encoded, str) or len(encoded) > (MAX_BYTES // 3 + 1) * 4:
        raise ValueError("Invalid image")
    try:
        image = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as err:
        raise ValueError("Invalid image") from err
    width, height = int(data.get("width", 0)), int(data.get("height", 0))
    cell = float(data.get("cellSize") or 0)
    if not 0 <= cell <= 2000:
        raise ValueError("Invalid cell size")
    sample = data.get("sample")
    if sample is not None:
        try:
            sample = {"x": float(sample["x"]), "y": float(sample["y"])}
        except (KeyError, TypeError, ValueError) as err:
            raise ValueError("Invalid sample") from err
    tolerance = data.get("tolerance", SAMPLE_TOLERANCE)
    if isinstance(tolerance, bool) or not isinstance(tolerance, (int, float)) or not MIN_TOLERANCE <= tolerance <= MAX_TOLERANCE:
        raise ValueError("Invalid tolerance")
    strictness = data.get("strictness", OUTLINE_SHARE)
    if isinstance(strictness, bool) or not isinstance(strictness, (int, float)) or not MIN_STRICTNESS <= strictness <= MAX_STRICTNESS:
        raise ValueError("Invalid strictness")
    min_length = data.get("minLength", 0)
    if isinstance(min_length, bool) or not isinstance(min_length, (int, float)) or not 0 <= min_length <= MAX_MIN_LENGTH:
        raise ValueError("Invalid minimum length")
    started = time.monotonic()
    # OpenCV releases the GIL, so a thread keeps the worker's lock renewals running meanwhile.
    result = await asyncio.to_thread(analyze, image, width, height, cell, sample, float(tolerance), float(strictness), float(min_length))
    # Sizes and timings only: never image contents or results.
    print(f"[vision] job {job.id}: {width}x{height}, {len(result['walls'])} walls in {time.monotonic() - started:.1f}s", flush=True)
    return result


async def main() -> None:
    url = os.environ.get("REDIS_URL")
    if not url:
        raise SystemExit("REDIS_URL is required: the wall worker consumes a BullMQ queue")
    concurrency = int(os.environ.get("WALL_WORKER_CONCURRENCY", "2"))
    worker = Worker(QUEUE, process, {"connection": url, "concurrency": concurrency, "lockDuration": 60_000})
    heartbeat = aioredis.from_url(url)

    async def beat():
        while True:
            try:
                await heartbeat.set(HEARTBEAT_KEY, "1", ex=HEARTBEAT_TTL_S)
            except Exception:  # Redis briefly away: the key expires and detection reads as unavailable.
                pass
            await asyncio.sleep(HEARTBEAT_EVERY_S)

    beating = asyncio.create_task(beat())
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    print(f"[vision] wall worker consuming '{QUEUE}'", flush=True)
    await stop.wait()
    beating.cancel()
    await heartbeat.delete(HEARTBEAT_KEY)
    await heartbeat.aclose()
    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
