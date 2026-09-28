"""Deterministic, labeled battle-map images used by the accuracy gate."""

from dataclasses import dataclass
import cv2
import numpy as np


@dataclass(frozen=True)
class Fixture:
    name: str
    cell: int = 0
    offset_x: int = 0
    offset_y: int = 0
    line: str = "dark"
    thickness: int = 1
    compression: str = "png"
    texture: str = "plain"
    partial: float = 1.0
    negative: str = ""


POSITIVES = [
    Fixture("ink-plain", 48, 11, 17),
    Fixture("ink-offset-zero", 64, 0, 0),
    Fixture("ink-small", 32, 7, 13),
    Fixture("ink-large", 96, 27, 43),
    Fixture("light-on-dark", 56, 9, 21, "light", texture="dark"),
    Fixture("light-wide", 72, 31, 6, "light", 2, texture="dark"),
    Fixture("dark-wide", 52, 18, 33, "dark", 2),
    Fixture("dark-thick", 84, 14, 53, "dark", 3),
    Fixture("blue-grid", 60, 24, 5, "blue", 1),
    Fixture("red-grid", 44, 3, 29, "red", 2),
    Fixture("terrain-stone", 50, 12, 37, texture="stone"),
    Fixture("terrain-forest", 68, 21, 40, "light", texture="forest"),
    Fixture("terrain-water", 40, 17, 4, "dark", texture="water"),
    Fixture("jpeg-high", 54, 15, 22, compression="jpeg95"),
    Fixture("jpeg-low", 66, 26, 9, "dark", 2, "jpeg68", "stone"),
    Fixture("webp-compressed", 58, 8, 30, "light", 1, "webp", "dark"),
    Fixture("partial-right", 46, 19, 8, partial=0.78),
    Fixture("partial-left", 62, 35, 16, "dark", 2, texture="stone", partial=0.72),
    Fixture("partial-texture", 74, 20, 39, "light", 1, texture="forest", partial=0.68),
    Fixture("faint-grid", 42, 5, 23, "faint", texture="stone"),
]

NEGATIVES = [
    Fixture("plain-terrain", texture="stone", negative="none"),
    Fixture("forest-terrain", texture="forest", negative="none"),
    Fixture("water-terrain", texture="water", negative="none"),
    Fixture("vertical-stripes", negative="vertical"),
    Fixture("horizontal-stripes", negative="horizontal"),
    Fixture("unequal-rectangle-grid", negative="rectangle"),
    Fixture("scattered-walls", negative="walls"),
    Fixture("diagonal-hatching", negative="diagonal"),
]

FIXTURES = POSITIVES + NEGATIVES


def render(fixture: Fixture) -> bytes:
    rng = np.random.default_rng(1903 + sum(map(ord, fixture.name)))
    height, width = 648, 768
    if fixture.texture == "dark":
        base = np.full((height, width, 3), (40, 43, 49), np.uint8)
    else:
        base = np.full((height, width, 3), (190, 184, 171), np.uint8)
    noise = rng.normal(0, 12 if fixture.texture != "plain" else 4, (height, width, 1))
    base = np.clip(base.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    if fixture.texture in ("stone", "forest", "water"):
        for _ in range(75):
            x, y = int(rng.integers(0, width)), int(rng.integers(0, height))
            radius = int(rng.integers(5, 35))
            shade = (75, 105, 85) if fixture.texture == "forest" else (155, 165, 180)
            cv2.circle(base, (x, y), radius, shade, -1, cv2.LINE_AA)
        base = cv2.GaussianBlur(base, (5, 5), 0.7)

    if fixture.negative:
        if fixture.negative == "vertical":
            for x in range(13, width, 49): cv2.line(base, (x, 0), (x, height), (35, 35, 35), 2)
        elif fixture.negative == "horizontal":
            for y in range(17, height, 57): cv2.line(base, (0, y), (width, y), (35, 35, 35), 2)
        elif fixture.negative == "rectangle":
            for x in range(13, width, 48): cv2.line(base, (x, 0), (x, height), (35, 35, 35), 1)
            for y in range(11, height, 76): cv2.line(base, (0, y), (width, y), (35, 35, 35), 1)
        elif fixture.negative == "walls":
            for _ in range(32):
                x, y = int(rng.integers(0, width)), int(rng.integers(0, height))
                cv2.line(base, (x, y), (min(width-1, x+int(rng.integers(15, 100))), y), (30, 30, 30), 2)
        elif fixture.negative == "diagonal":
            for x in range(-height, width, 53): cv2.line(base, (x, 0), (x+height, height), (45, 45, 45), 1)
    elif fixture.cell:
        palette = {"dark": (28, 31, 32), "light": (240, 241, 243), "blue": (190, 80, 28),
                   "red": (35, 45, 200), "faint": (130, 128, 125)}
        color = palette[fixture.line]
        overlay = base.copy()
        end_x = int(width * fixture.partial)
        end_y = int(height * fixture.partial)
        for x in range(fixture.offset_x, width, fixture.cell):
            if x < end_x: cv2.line(overlay, (x, 0), (x, end_y-1), color, fixture.thickness)
        for y in range(fixture.offset_y, height, fixture.cell):
            if y < end_y: cv2.line(overlay, (0, y), (end_x-1, y), color, fixture.thickness)
        base = overlay

    if fixture.compression.startswith("jpeg"):
        ext, params = ".jpg", [cv2.IMWRITE_JPEG_QUALITY, int(fixture.compression[4:])]
    elif fixture.compression == "webp":
        ext, params = ".webp", [cv2.IMWRITE_WEBP_QUALITY, 72]
    else:
        ext, params = ".png", []
    ok, encoded = cv2.imencode(ext, base, params)
    assert ok
    return encoded.tobytes()
