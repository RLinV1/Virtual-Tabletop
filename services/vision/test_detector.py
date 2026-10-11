import unittest

from detector import detect_bytes
from fixtures import FIXTURES, NEGATIVES, POSITIVES, render


def phase_error(actual, expected, cell):
    return min(abs(actual - expected), abs(actual - expected + cell), abs(actual - expected - cell))


class DetectorAccuracyTest(unittest.TestCase):
    def test_fixture_collection_and_accuracy(self):
        self.assertGreaterEqual(len(FIXTURES), 24)
        good = 0
        failures = []
        for fixture in POSITIVES:
            result = detect_bytes(render(fixture), 768, 648)
            correct = (result["kind"] == "candidate"
                       and abs(result["cellSize"] - fixture.cell) <= 2
                       and phase_error(result["offsetX"], fixture.offset_x, fixture.cell) <= 2
                       and phase_error(result["offsetY"], fixture.offset_y, fixture.cell) <= 2)
            good += int(correct)
            if not correct: failures.append((fixture.name, result))
        self.assertGreaterEqual(good / len(POSITIVES), 0.9, failures)

    def test_no_negative_has_high_confidence(self):
        failures = []
        for fixture in NEGATIVES:
            result = detect_bytes(render(fixture), 768, 648)
            if result["kind"] == "candidate" and result["confidence"] >= 0.75:
                failures.append((fixture.name, result))
        self.assertFalse(failures, failures)

    def test_invalid_image_and_dimensions(self):
        with self.assertRaises(ValueError): detect_bytes(b"garbage", 768, 648)
        with self.assertRaises(ValueError): detect_bytes(render(POSITIVES[0]), 500, 648)
        with self.assertRaises(ValueError): detect_bytes(b"x", 16384, 16384)


if __name__ == "__main__":
    unittest.main()
