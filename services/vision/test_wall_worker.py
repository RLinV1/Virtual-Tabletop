"""The BullMQ job handler, called directly without Redis (ADR 0025)."""

import asyncio
import base64
import unittest
from types import SimpleNamespace

from test_walls import CELL, SIZE, encode, ink_dungeon
from wall_worker import process


def job(**data):
    return SimpleNamespace(id="test", data=data)


class WallWorkerTest(unittest.TestCase):
    def test_returns_walls_and_preview(self):
        image = base64.b64encode(encode(ink_dungeon())).decode("ascii")
        result = asyncio.run(process(job(image=image, width=SIZE[1], height=SIZE[0], cellSize=CELL)))
        self.assertTrue(result["walls"])
        self.assertEqual(set(result), {"walls", "preview"})
        self.assertEqual(set(result["preview"]), {"contentType", "width", "height", "data"})

    def test_fails_the_job_on_bad_input(self):
        for data in ({}, {"image": "%%%", "width": 10, "height": 10}, {"image": "aGVsbG8=", "width": 5, "height": 5},
                     {"image": "aGVsbG8=", "width": 5, "height": 5, "cellSize": -1}):
            with self.assertRaises(ValueError):
                asyncio.run(process(job(**data)))


if __name__ == "__main__":
    unittest.main()
