"""The BullMQ job handler, called directly without Redis (ADR 0029, wall-job-transport)."""

import asyncio
import hashlib
import unittest
from unittest import mock
from types import SimpleNamespace

from test_walls import CELL, SIZE, encode, ink_dungeon
from wall_worker import IMAGE_KEY, process


def job(**data):
    return SimpleNamespace(id="test", data=data)


def stored(image: bytes):
    """A stand-in Redis holding `image` under the key the app server would give it, and a fetch for it."""
    key = "vtt:wall-image:" + hashlib.sha256(image).hexdigest()
    reads = []

    async def fetch(requested):
        reads.append(requested)
        return image if requested == key else None

    return key, fetch, reads


def run(key, fetch, **extra):
    return asyncio.run(process(job(imageKey=key, **extra), fetch=fetch))


class WallWorkerTest(unittest.TestCase):
    def setUp(self):
        self.key, self.fetch, self.reads = stored(encode(ink_dungeon()))
        self.common = dict(width=SIZE[1], height=SIZE[0], cellSize=CELL)

    def test_returns_walls_and_preview(self):
        result = run(self.key, self.fetch, **self.common)
        self.assertTrue(result["walls"])
        self.assertEqual(set(result), {"walls", "preview"})
        self.assertEqual(set(result["preview"]), {"contentType", "width", "height", "data"})
        self.assertEqual(self.reads, [self.key])

    def test_runs_as_bullmq_calls_it(self):
        # BullMQ calls process(job, token, signal): the signal must not be taken for the image fetch.
        signal = object()
        with mock.patch("wall_worker._fetch_image", self.fetch):
            result = asyncio.run(process(job(imageKey=self.key, **self.common), "token", signal))
        self.assertTrue(result["walls"])

    def test_passes_a_sample_through(self):
        result = run(self.key, self.fetch, **self.common, sample={"x": 140, "y": 300})
        self.assertTrue(result["walls"])
        with self.assertRaises(ValueError):
            run(self.key, self.fetch, **self.common, sample={"x": "left"})

    def test_passes_a_tolerance_through_and_refuses_a_bad_one(self):
        common = dict(**self.common, sample={"x": 140, "y": 300})
        self.assertTrue(run(self.key, self.fetch, **common, tolerance=20)["walls"])
        for bad in (0, 500, "wide", True):
            with self.assertRaises(ValueError):
                run(self.key, self.fetch, **common, tolerance=bad)
        self.assertTrue(run(self.key, self.fetch, **common, strictness=0.5, minLength=1)["walls"])
        self.assertTrue(run(self.key, self.fetch, **common, style="dark")["walls"])
        self.assertIsInstance(run(self.key, self.fetch, **common, style="outlined")["walls"], list)
        with self.assertRaises(ValueError):
            run(self.key, self.fetch, **common, style="glass")
        for field, bad in (("strictness", 0.9), ("strictness", "x"), ("minLength", -1), ("minLength", 9), ("minLength", True)):
            with self.assertRaises(ValueError):
                run(self.key, self.fetch, **common, **{field: bad})

    def test_fails_the_job_on_bad_input(self):
        for data in ({}, {"imageKey": 5, "width": 10, "height": 10},
                     {"width": 5, "height": 5, "cellSize": -1}):
            with self.assertRaises(ValueError):
                asyncio.run(process(job(**data), fetch=self.fetch))
        with self.assertRaises(ValueError):
            run(self.key, self.fetch, width=5, height=5, cellSize=-1)

    def test_refuses_a_key_that_is_not_an_image_key_without_reading_it(self):
        for key in ("vtt:wall-worker:heartbeat", "bull:wall-detection:id", "vtt:wall-image:", "vtt:wall-image:ABC",
                    self.key + "x", "x" + self.key, self.key.upper(), "vtt:wall-image:" + "g" * 64):
            with self.assertRaises(ValueError):
                run(key, self.fetch, **self.common)
        self.assertEqual(self.reads, [])

    def test_fails_when_the_image_is_gone_or_too_large(self):
        gone = "vtt:wall-image:" + "0" * 64
        with self.assertRaises(ValueError):
            run(gone, self.fetch, **self.common)
        self.assertEqual(self.reads, [gone])

        async def empty(_key):
            return b""

        async def huge(_key):
            return b"0" * (26 * 1024 * 1024)

        for fetch in (empty, huge):
            with self.assertRaises(ValueError):
                run(self.key, fetch, **self.common)

    def test_the_key_shape_matches_what_the_server_makes(self):
        self.assertTrue(IMAGE_KEY.fullmatch(self.key))


if __name__ == "__main__":
    unittest.main()
