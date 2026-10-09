"""BullMQ consumer for wall detection (FR-GM-11, ADR 0025).

The app server produces jobs on the `wall-detection` queue in the app's Redis; this process
consumes them and returns `{walls, preview}` as the job's return value. The app server learns of
completion from BullMQ's queue events, validates the result, and notifies the room's GM.

Job data: `{ image: base64 bytes, width, height, cellSize }`. The bytes were read by the app server
from its own storage; this worker never fetches a URL, and holds no database or storage credentials.
"""

import asyncio
import base64
import binascii
import os
import signal

from bullmq import Worker

from walls import MAX_BYTES, analyze

QUEUE = "wall-detection"


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
    # OpenCV releases the GIL, so a thread keeps the worker's lock renewals running meanwhile.
    return await asyncio.to_thread(analyze, image, width, height, cell)


async def main() -> None:
    url = os.environ.get("REDIS_URL")
    if not url:
        raise SystemExit("REDIS_URL is required: the wall worker consumes a BullMQ queue")
    concurrency = int(os.environ.get("WALL_WORKER_CONCURRENCY", "2"))
    worker = Worker(QUEUE, process, {"connection": url, "concurrency": concurrency, "lockDuration": 60_000})
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    print(f"[vision] wall worker consuming '{QUEUE}'", flush=True)
    await stop.wait()
    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
