"""Wall extraction on labelled synthetic maps (FR-GM-11, ADR 0025)."""

import base64
import unittest

import cv2
import numpy as np

from walls import MAX_WALLS, analyze, decode, detect_walls

CELL = 70
SIZE = (980, 1400)  # height, width


def floor(seed: int, colour=(205, 215, 222), grid=(150, 150, 150)) -> np.ndarray:
    """A noisy floor with a thin printed grid, which must never read as walls."""
    rng = np.random.default_rng(seed)
    img = np.full((*SIZE, 3), colour, np.uint8)
    img = (img.astype(np.int16) + rng.normal(0, 9, img.shape)).clip(0, 255).astype(np.uint8)
    for x in range(0, SIZE[1], CELL):
        cv2.line(img, (x, 0), (x, SIZE[0] - 1), grid, 1)
    for y in range(0, SIZE[0], CELL):
        cv2.line(img, (0, y), (SIZE[1] - 1, y), grid, 1)
    return img


ROOMS = [(140, 140, 630, 490), (630, 140, 1120, 420), (280, 560, 980, 840)]


def ink_dungeon() -> np.ndarray:
    """Classic map: thick dark walls, a doorway, a label and scattered dots."""
    img = floor(3)
    for room in ROOMS:
        cv2.rectangle(img, room[:2], room[2:], (35, 35, 35), 16)
    cv2.line(img, (420, 490), (490, 490), (205, 215, 222), 18)
    cv2.putText(img, "CRYPT", (300, 300), 0, 2, (60, 60, 60), 4)
    rng = np.random.default_rng(4)
    for _ in range(40):
        centre = (int(rng.integers(0, SIZE[1])), int(rng.integers(0, SIZE[0])))
        cv2.circle(img, centre, int(rng.integers(3, 9)), (90, 90, 90), -1)
    return img


def stone_keep() -> np.ndarray:
    """Painted map: light stone walls with dark outlines over a darker flagstone floor."""
    img = floor(5, colour=(95, 105, 110), grid=(70, 78, 82))
    for room in ROOMS:
        x1, y1, x2, y2 = room
        for a, b in (((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)), ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1))):
            cv2.line(img, a, b, (20, 20, 20), 34)
            cv2.line(img, a, b, (200, 205, 210), 26)
    return img


def encode(img: np.ndarray) -> bytes:
    ok, data = cv2.imencode(".png", img)
    assert ok
    return data.tobytes()


def near_room_edge(wall: dict, tolerance: float = 14) -> bool:
    """Whether both ends of a wall lie on the outline of one of ROOMS."""
    def on_edge(p):
        for x1, y1, x2, y2 in ROOMS:
            on_vertical = min(abs(p["x"] - x1), abs(p["x"] - x2)) <= tolerance and y1 - tolerance <= p["y"] <= y2 + tolerance
            on_horizontal = min(abs(p["y"] - y1), abs(p["y"] - y2)) <= tolerance and x1 - tolerance <= p["x"] <= x2 + tolerance
            if on_vertical or on_horizontal:
                return True
        return False
    return on_edge(wall["a"]) and on_edge(wall["b"])


def total_length(walls: list) -> float:
    return sum(np.hypot(w["b"]["x"] - w["a"]["x"], w["b"]["y"] - w["a"]["y"]) for w in walls)


ROOM_PERIMETER = sum(2 * (x2 - x1) + 2 * (y2 - y1) for x1, y1, x2, y2 in ROOMS)


class WallDetectionTest(unittest.TestCase):
    def assert_finds_rooms(self, img: np.ndarray):
        walls = detect_walls(img, CELL)["walls"]
        self.assertTrue(walls)
        on_rooms = [w for w in walls if near_room_edge(w)]
        # Precision: what was found lies on the walls, not the grid, the label or the dots.
        self.assertGreaterEqual(total_length(on_rooms) / total_length(walls), 0.95)
        # Recall: most of the drawn wall is covered. Shared edges count once in the drawing.
        self.assertGreaterEqual(total_length(on_rooms) / ROOM_PERIMETER, 0.7)

    def test_dark_ink_walls(self):
        self.assert_finds_rooms(ink_dungeon())

    def test_bright_stone_walls(self):
        self.assert_finds_rooms(stone_keep())

    def test_keeps_a_doorway_open(self):
        walls = detect_walls(ink_dungeon(), CELL)["walls"]
        # Nothing crosses the middle of the doorway in the bottom wall of the first room.
        for w in walls:
            lo, hi = sorted((w["a"]["x"], w["b"]["x"]))
            if abs(w["a"]["y"] - 490) < 14 and abs(w["b"]["y"] - 490) < 14:
                self.assertFalse(lo < 455 < hi, w)

    def test_grid_alone_is_not_walls(self):
        self.assertEqual(detect_walls(floor(7), CELL)["walls"], [])

    def test_unknown_grid_still_works(self):
        walls = detect_walls(ink_dungeon(), 0)["walls"]
        self.assertTrue(walls)

    def test_analyze_returns_walls_and_a_preview(self):
        img = ink_dungeon()
        result = analyze(encode(img), SIZE[1], SIZE[0], CELL)
        self.assertLessEqual(len(result["walls"]), MAX_WALLS)
        for w in result["walls"]:
            for p in (w["a"], w["b"]):
                self.assertTrue(0 <= p["x"] <= SIZE[1] and 0 <= p["y"] <= SIZE[0])
        preview = result["preview"]
        self.assertEqual(preview["contentType"], "image/jpeg")
        decoded = cv2.imdecode(np.frombuffer(base64.b64decode(preview["data"]), np.uint8), cv2.IMREAD_COLOR)
        self.assertEqual(decoded.shape[:2], (preview["height"], preview["width"]))
        self.assertLessEqual(max(preview["width"], preview["height"]), 1024)

    def test_rejects_bad_input(self):
        with self.assertRaises(ValueError):
            decode(b"not an image", 10, 10)
        with self.assertRaises(ValueError):
            decode(encode(floor(1)), 100, 100)  # stated size doesn't match
        with self.assertRaises(ValueError):
            decode(b"", 10, 10)
        with self.assertRaises(ValueError):
            decode(encode(floor(1)), 20_000, 20_000)


if __name__ == "__main__":
    unittest.main()
