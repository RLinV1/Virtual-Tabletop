"""Wall extraction on labelled synthetic maps (FR-GM-11, ADR 0029)."""

import base64
import math
import os
import unittest
from unittest import mock

import cv2
import numpy as np

import walls
from walls import MAX_WALLS, analyze, decode, detect_model, detect_walls

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


def painted_hall() -> np.ndarray:
    """Walls as bright as the floor, told apart only by colour: warm stone on a cool floor."""
    img = floor(9, colour=(150, 140, 120), grid=(120, 112, 96))  # BGR: blue-grey floor
    for room in ROOMS:
        x1, y1, x2, y2 = room
        for a, b in (((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)), ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1))):
            cv2.line(img, a, b, (25, 30, 35), 34)
            cv2.line(img, a, b, (95, 135, 175), 26)  # BGR: tan stone, about the floor's brightness
    return img


# Two buildings and a cave drawn as thin ink outlines, with diagonal sides the stone search can't follow.
OUTLINES = [
    np.array([(200, 160), (560, 160), (640, 360), (480, 520), (200, 420)], np.int32),
    np.array([(760, 200), (1180, 260), (1120, 560), (820, 520)], np.int32),
    np.array([(360, 640), (760, 600), (1060, 760), (700, 900), (380, 860)], np.int32),
]


def inked_outlines() -> np.ndarray:
    """A hand-drawn map: rooms and a cave outlined in a 5 px dark line on a paper-coloured floor."""
    img = floor(13, colour=(196, 214, 226), grid=(170, 184, 194))
    for outline in OUTLINES:
        cv2.polylines(img, [outline], True, (40, 40, 45), 5, cv2.LINE_AA)
    return img


def near_outline(wall: dict, tolerance: float = 12) -> bool:
    """Whether both ends of a wall lie on one of OUTLINES."""
    def on(p):
        point = (float(p["x"]), float(p["y"]))
        return any(abs(cv2.pointPolygonTest(o.reshape(-1, 1, 2).astype(np.float32), point, True)) <= tolerance for o in OUTLINES)
    return on(wall["a"]) and on(wall["b"])


def diagonal(wall: dict) -> bool:
    dx, dy = abs(wall["b"]["x"] - wall["a"]["x"]), abs(wall["b"]["y"] - wall["a"]["y"])
    return min(dx, dy) > 0.25 * max(dx, dy)


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
    def setUp(self):
        # These tests cover the rule-based detector, so keep the learned model (models/walls.onnx) out of them.
        patcher = mock.patch.object(walls, "_load_model", return_value=None)
        patcher.start()
        self.addCleanup(patcher.stop)

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

    def test_analyze_applies_min_length_in_the_rooms_cells(self):
        data = encode(ink_dungeon())
        minimum = 6
        walls = analyze(data, SIZE[1], SIZE[0], CELL, min_length=minimum)["walls"]
        self.assertTrue(walls)
        for w in walls:
            self.assertGreaterEqual(math.hypot(w["b"]["x"] - w["a"]["x"], w["b"]["y"] - w["a"]["y"]), minimum * CELL - 0.5)

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

    def test_sample_finds_walls_by_colour(self):
        img = painted_hall()
        # Click on the middle of the first room's top wall.
        sampled = detect_walls(img, CELL, {"x": 385, "y": 140})["walls"]
        on_rooms = [w for w in sampled if near_room_edge(w)]
        self.assertGreaterEqual(total_length(on_rooms) / total_length(sampled), 0.95)
        self.assertGreaterEqual(total_length(on_rooms) / ROOM_PERIMETER, 0.7)

    def test_sample_in_dark_ink(self):
        walls = detect_walls(ink_dungeon(), CELL, {"x": 140, "y": 300})["walls"]
        on_rooms = [w for w in walls if near_room_edge(w)]
        self.assertGreaterEqual(total_length(on_rooms) / ROOM_PERIMETER, 0.7)

    def test_sample_tolerance_is_honoured(self):
        img = painted_hall()
        point = {"x": 385, "y": 140}
        self.assertEqual(detect_walls(img, CELL, point), detect_walls(img, CELL, point, 30))
        tight = detect_walls(img, CELL, point, 12)["walls"]
        self.assertGreaterEqual(total_length([w for w in tight if near_room_edge(w)]) / ROOM_PERIMETER, 0.5)
        # A range wide enough to take in the floor leaves no wall to tell apart.
        self.assertEqual(detect_walls(img, CELL, point, 45)["walls"], [])

    def test_strictness_and_minimum_length_only_remove_walls(self):
        img = stone_keep()
        default = detect_walls(img, CELL)["walls"]
        self.assertEqual(default, detect_walls(img, CELL, None, 30, 0.4, 0)["walls"])
        long_only = detect_walls(img, CELL, None, 30, 0.4, 6)["walls"]
        self.assertLessEqual(len(long_only), len(default))
        self.assertTrue(all(np.hypot(w["b"]["x"] - w["a"]["x"], w["b"]["y"] - w["a"]["y"]) >= 6 * CELL * 0.95 for w in long_only))
        self.assertLessEqual(len(detect_walls(img, CELL, None, 30, 0.6, 0)["walls"]), len(default))

    def test_a_sparse_stone_map_gets_its_light_walls_not_dark_shadows(self):
        # The Broken Span crop has few, thick stone walls. Automatic detection must keep to the light
        # stone (the dark family there traces shadows and scraps), and the style can be forced.
        path = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "web", "public", "img", "home", "broken-span.webp")
        if not os.path.exists(path):
            self.skipTest("bundled map not present")
        img = cv2.imread(path)
        automatic = detect_walls(img, 70)
        self.assertEqual(automatic["mask"], "bright")
        self.assertTrue(automatic["walls"])
        self.assertEqual(detect_walls(img, 70, style="bright")["walls"], automatic["walls"])
        self.assertEqual(detect_walls(img, 70, style="dark")["mask"], "dark")

    def test_style_limits_automatic_detection_to_one_kind_of_wall(self):
        dark = detect_walls(ink_dungeon(), CELL, style="dark")["walls"]
        wrong = detect_walls(ink_dungeon(), CELL, style="bright")["walls"]
        self.assertTrue(dark)
        # Looking for the wrong kind of wall finds little of what is drawn.
        self.assertLess(total_length(wrong), 0.25 * total_length(dark))
        self.assertTrue(detect_walls(stone_keep(), CELL, style="bright")["walls"])

    def test_outlined_style_follows_inked_outlines_with_diagonal_walls(self):
        walls = detect_walls(inked_outlines(), CELL, style="outlined")["walls"]
        self.assertTrue(walls)
        on_outlines = [w for w in walls if near_outline(w)]
        self.assertGreaterEqual(total_length(on_outlines) / total_length(walls), 0.9)
        perimeter = sum(cv2.arcLength(o.reshape(-1, 1, 2).astype(np.float32), True) for o in OUTLINES)
        self.assertGreaterEqual(total_length(on_outlines) / perimeter, 0.6)
        self.assertTrue(any(diagonal(w) for w in on_outlines))

    def test_automatic_detection_falls_back_to_the_outlines_only_when_stone_finds_little(self):
        outlined = detect_walls(inked_outlines(), CELL)
        self.assertTrue(outlined["mask"].startswith("outlines:"))
        self.assertTrue(any(diagonal(w) for w in outlined["walls"]))
        # A stone map keeps the stone search's walls.
        self.assertFalse(detect_walls(stone_keep(), CELL)["mask"].startswith("outlines:"))

    def test_sample_outside_the_image_is_refused(self):
        with self.assertRaises(ValueError):
            analyze(encode(ink_dungeon()), SIZE[1], SIZE[0], CELL, {"x": SIZE[1] + 5, "y": 10})

    def test_rejects_bad_input(self):
        with self.assertRaises(ValueError):
            decode(b"not an image", 10, 10)
        with self.assertRaises(ValueError):
            decode(encode(floor(1)), 100, 100)  # stated size doesn't match
        with self.assertRaises(ValueError):
            decode(b"", 10, 10)
        with self.assertRaises(ValueError):
            decode(encode(floor(1)), 20_000, 20_000)


@unittest.skipUnless(os.path.exists(walls.MODEL_PATH), "models/walls.onnx is not present")
class ShippedModel(unittest.TestCase):
    """The ONNX model that ships in models/ loads on the CPU and finds the rooms of a clean ink map."""

    def test_the_shipped_model_finds_the_rooms_of_an_ink_map(self):
        result = detect_model(ink_dungeon(), CELL)
        found = result["walls"]
        self.assertTrue(found)
        on_rooms = [w for w in found if near_room_edge(w)]
        self.assertGreaterEqual(total_length(on_rooms) / total_length(found), 0.8)
        self.assertGreaterEqual(total_length(on_rooms) / ROOM_PERIMETER, 0.6)


class WallConfidence(unittest.TestCase):
    """Per-wall confidence from the learned model (wall-review, ADR 0038)."""

    def test_confidence_is_the_mean_probability_along_a_segment(self):
        probability = np.zeros((100, 100), np.float32)
        probability[40:60, :] = 0.9
        self.assertAlmostEqual(walls._confidence(probability, (5, 50, 95, 50)), 0.9, places=2)
        self.assertEqual(walls._confidence(probability, (5, 10, 95, 10)), 0.0)
        # Crossing the band covers a fifth of the samples; an end past the edge is clamped, not an error.
        self.assertTrue(0.1 < walls._confidence(probability, (50, 0, 50, 99)) < 0.3)
        self.assertIsInstance(walls._confidence(probability, (-5, 50, 120, 50)), float)

    def test_model_walls_carry_confidence_and_a_weak_wall_scores_lower(self):
        image = floor(7)

        def probability(work, _net):
            p = np.zeros(work.shape[:2], np.float32)
            p[90:110, 40:400] = 0.95  # a clear wall
            p[60:380, 490:510] = 0.5  # a faint one
            return p

        with mock.patch.object(walls, "_load_model", return_value=object()), mock.patch.object(walls, "_wall_probability", probability):
            result = detect_model(image, CELL, threshold=0.4)
        self.assertTrue(result["walls"])
        for wall in result["walls"]:
            self.assertGreaterEqual(wall["confidence"], 0.0)
            self.assertLessEqual(wall["confidence"], 1.0)
            self.assertEqual(set(wall), {"a", "b", "confidence"})
        horizontal = [w for w in result["walls"] if abs(w["a"]["y"] - w["b"]["y"]) < 5]
        vertical = [w for w in result["walls"] if abs(w["a"]["x"] - w["b"]["x"]) < 5]
        self.assertTrue(horizontal and vertical)
        self.assertGreater(min(w["confidence"] for w in horizontal), 0.85)
        self.assertLess(max(w["confidence"] for w in vertical), 0.6)

    def test_rule_based_walls_have_no_confidence(self):
        result = detect_walls(ink_dungeon(), CELL, style="dark")
        self.assertTrue(result["walls"])
        self.assertTrue(all("confidence" not in w for w in result["walls"]))

    def test_analyze_keeps_confidence_through_the_minimum_length_filter(self):
        with mock.patch.object(walls, "detect_walls", return_value={"walls": [{"a": {"x": 0, "y": 0}, "b": {"x": 400, "y": 0}, "confidence": 0.4}], "mask": "model", "score": 1}):
            result = analyze(encode(floor(3)), SIZE[1], SIZE[0], CELL, min_length=1)
        self.assertEqual(result["walls"][0]["confidence"], 0.4)


if __name__ == "__main__":
    unittest.main()
