"""Wall extraction for battle maps (FR-GM-11, ADR 0029).

Pipeline, after the prior art named in docs/DESIGN.md section 7 (ThreeHats/auto-wall and
DimitroffVodka/foundry-auto-wall, both MIT) and standard floor-plan wall extraction:

1. Bounded decode and downscale to a working image. The grid's cell size, from the room or from
   the grid detector, sets every kernel, so a wall is judged against the squares it is drawn on.
2. Wall mask. Prior art asks the GM to pick the wall colour; here a morphological top-hat finds
   bands thinner than about a cell that stand out from their surroundings: bright raised stone
   (white top-hat) or dark ink (black top-hat), at a thin- and a thick-wall scale.
3. Directional opening keeps only long horizontal and vertical runs, dropping rubble and specks;
   a run is kept only when enough of its edge lies along a contrasting outline, which drawn walls
   have and snow, foliage and highlights do not.
4. Centreline tracing: Zhang-Suen thinning, walked as a pixel graph into polylines (the
   centreline mode of foundry-auto-wall, which avoids the double-wall artefact of thick strokes).
5. Ramer-Douglas-Peucker, near-axis snapping, endpoint welding and collinear merging; stair
   hatching (short, closely spaced parallel pieces), slivers, and short scraps not joined to a
   long run are dropped.

Both styles are tried and the one with more long straight wall wins. The result is a suggestion:
the GM reviews it on the rendered preview before applying (ADR 0029). Coordinates returned are
original image pixels, the room's board coordinates (invariant 8).
"""

import base64
import math
import os

os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "40000000")

import cv2
import numpy as np

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_EDGE = 16_384
# Must match MAX_WALLS in packages/shared/src/state.ts.
MAX_WALLS = 1500
WORK_EDGE = 1200
PREVIEW_EDGE = 1024
# Widest wall each top-hat keeps, in cells: thin drawn walls, and walls up to about a square thick.
BAND_CELLS = (0.9, 1.5)
# How far, in Lab units (8-bit scale), a pixel's colour may be from a sampled wall's to count.
SAMPLE_TOLERANCE = 30.0
# Share of a run's edge that must follow a contrasting outline; higher drops more terrain, and some walls.
OUTLINE_SHARE = 0.4
# A sampled colour this dark (Lab L, 8-bit) is ink: its strokes need no separate outline.
DARK_INK_L = 80


def decode(data: bytes, width: int, height: int) -> np.ndarray:
    """Decode an upload, refusing anything outside the size limits or unlike its stated size."""
    if not 0 < len(data) <= MAX_BYTES:
        raise ValueError("Invalid image size")
    if not (0 < width <= MAX_EDGE and 0 < height <= MAX_EDGE and width * height <= MAX_PIXELS):
        raise ValueError("Invalid image dimensions")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unreadable image")
    if image.shape[1] != width or image.shape[0] != height:
        raise ValueError("Image dimensions do not match")
    return image


# ---------- wall mask ----------

def _kernel(width: float, height: float = None, shape=cv2.MORPH_RECT) -> np.ndarray:
    height = width if height is None else height
    return cv2.getStructuringElement(shape, (max(1, int(round(width))), max(1, int(round(height)))))


def _strong(values: np.ndarray, floor: float = 20.0) -> np.ndarray:
    """Pixels clearly above the response's background: Otsu, but never below mean + 1 std."""
    otsu, _ = cv2.threshold(values, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return values > max(otsu, float(values.mean() + values.std()), floor)


def _wall_masks(gray: np.ndarray, cell: float, share: float = OUTLINE_SHARE) -> list:
    """Candidate wall masks: bright raised walls and dark ink walls, each with its outline check."""
    line = _kernel(cell * 0.25, shape=cv2.MORPH_ELLIPSE)
    dark_lines = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, line)
    out = []
    # One family per wall style, each the union of its thin- and thick-wall scales.
    for name in ("bright", "dark"):
        family = np.zeros_like(gray)
        for width in BAND_CELLS:
            band = _kernel(cell * width, shape=cv2.MORPH_ELLIPSE)
            if name == "bright":
                response = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, band)
                contrast = dark_lines
            else:
                response = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, band)
                contrast = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, band)
            mask = _strong(response).astype(np.uint8) * 255
            outline = cv2.dilate(_strong(contrast).astype(np.uint8) * 255, _kernel(3))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _kernel(cell * 0.12))
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(cell * 0.12))
            # Straight runs first: rubble touching a wall would otherwise fail the wall's outline check.
            family = cv2.bitwise_or(family, _outlined(_straight_runs(mask, cell), outline, share))
        out.append((name, family, cell))
    return out


def _sampled_mask(work: np.ndarray, gray: np.ndarray, cell: float, point: tuple,
                  tolerance: float = SAMPLE_TOLERANCE, share: float = OUTLINE_SHARE) -> np.ndarray:
    """Walls the colour of the one the GM clicked (wall-editing): the colour pick of prior art.

    The reference is the median Lab colour of a small disc around the point, so a click on a
    block's edge or a speck still reads the wall. Regions wider than a wall (a floor that happens
    to match) are removed, then the usual shape rules decide what is a wall.
    """
    lab = cv2.cvtColor(cv2.bilateralFilter(work, 9, 40, 7), cv2.COLOR_BGR2LAB).astype(np.float32)
    height, width = gray.shape
    x = int(min(max(round(point[0]), 0), width - 1))
    y = int(min(max(round(point[1]), 0), height - 1))
    r = max(2, int(round(cell * 0.15)))
    patch = lab[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1].reshape(-1, 3)
    reference = np.median(patch, axis=0)
    distance = np.sqrt(((lab - reference) ** 2).sum(axis=2))
    mask = (distance < tolerance).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, _kernel(cell * 0.12))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(cell * 0.12))
    wide = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(cell * max(BAND_CELLS) * 1.1))
    mask = cv2.subtract(mask, cv2.dilate(wide, _kernel(cell * 0.2)))
    runs = _straight_runs(mask, cell)
    # Dark ink is its own outline; anything lighter must follow a drawn edge, as in automatic mode.
    if reference[0] < DARK_INK_L:
        return runs
    dark_lines = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, _kernel(cell * 0.25, shape=cv2.MORPH_ELLIPSE))
    return _outlined(runs, cv2.dilate(_strong(dark_lines).astype(np.uint8) * 255, _kernel(3)), share)


def _outlined(mask: np.ndarray, outline: np.ndarray, share: float = OUTLINE_SHARE) -> np.ndarray:
    """Keeps the components whose boundary mostly runs along a contrasting outline."""
    count, labels = cv2.connectedComponents(mask, connectivity=8)
    boundary = cv2.subtract(mask, cv2.erode(mask, _kernel(3))) > 0
    total = np.bincount(labels[boundary], minlength=count).astype(np.float64)
    touching = np.bincount(labels[boundary & (outline > 0)], minlength=count).astype(np.float64)
    keep = touching >= share * np.maximum(total, 1)
    keep[0] = False
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def _straight_runs(mask: np.ndarray, cell: float) -> np.ndarray:
    """Only long horizontal and vertical runs survive: walls, not rubble, trees or specks."""
    horizontal = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(cell * 1.5, 1))
    vertical = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(1, cell * 1.5))
    return cv2.bitwise_or(horizontal, vertical)


# ---------- centreline ----------

def _thinning_tables() -> list:
    """Per sub-iteration, whether a pixel with a given 8-neighbour code is removed (Zhang-Suen)."""
    tables = []
    for step in (0, 1):
        table = np.zeros(256, np.uint8)
        for code in range(256):
            # Bit k of the code is neighbour P(k+2), clockwise from north.
            p2, p3, p4, p5, p6, p7, p8, p9 = [(code >> k) & 1 for k in range(8)]
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            b = sum(seq[:8])
            a = sum(1 for i in range(8) if seq[i] == 0 and seq[i + 1] == 1)
            if step == 0:
                c = p2 * p4 * p6 == 0 and p4 * p6 * p8 == 0
            else:
                c = p2 * p4 * p8 == 0 and p2 * p6 * p8 == 0
            table[code] = 2 <= b <= 6 and a == 1 and c
        tables.append(table)
    return tables


_THINNING = _thinning_tables()
# filter2D weights that pack the 8 neighbours into one byte, bit k = P(k+2): N, NE, E, SE, S, SW, W, NW.
_NEIGHBOUR_BITS = np.array([[128, 1, 2], [64, 0, 4], [32, 16, 8]], np.float32)


def _thin(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning to a one-pixel skeleton."""
    img = (mask > 0).astype(np.uint8)
    while True:
        changed = False
        for table in _THINNING:
            code = cv2.filter2D(img, cv2.CV_8U, _NEIGHBOUR_BITS, borderType=cv2.BORDER_CONSTANT)
            remove = (img == 1) & (table[code] == 1)
            if remove.any():
                img[remove] = 0
                changed = True
        if not changed:
            return img


_NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def _trace(skeleton: np.ndarray) -> list:
    """Walks the skeleton's pixel graph into polylines between junctions and endpoints."""
    ys, xs = np.nonzero(skeleton)
    pixels = set(zip(ys.tolist(), xs.tolist()))

    def neighbours(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in _NEIGHBOURS if (y + dy, x + dx) in pixels]

    degree = {p: len(neighbours(p)) for p in pixels}
    nodes = {p for p, d in degree.items() if d != 2}
    seen_edges = set()
    lines = []

    def walk(start, nxt):
        path = [start, nxt]
        prev, cur = start, nxt
        while cur not in nodes:
            options = [q for q in neighbours(cur) if q != prev and (min(cur, q), max(cur, q)) not in seen_edges]
            if not options:
                break
            prev, cur = cur, options[0]
            seen_edges.add((min(prev, cur), max(prev, cur)))
            path.append(cur)
        return path

    for node in nodes:
        for nxt in neighbours(node):
            key = (min(node, nxt), max(node, nxt))
            if key in seen_edges:
                continue
            seen_edges.add(key)
            lines.append(walk(node, nxt))
    # Closed loops have no node at all: start anywhere on them.
    visited = {p for line in lines for p in line}
    for p in pixels:
        if p in visited or degree[p] != 2:
            continue
        first = neighbours(p)[0]
        seen_edges.add((min(p, first), max(p, first)))
        line = walk(p, first)
        visited.update(line)
        lines.append(line)
    return lines


# ---------- segments ----------

def _simplify(lines: list, epsilon: float) -> list:
    segments = []
    for line in lines:
        if len(line) < 2:
            continue
        pts = np.array([[x, y] for y, x in line], np.float32).reshape(-1, 1, 2)
        approx = cv2.approxPolyDP(pts, epsilon, False).reshape(-1, 2)
        for a, b in zip(approx[:-1], approx[1:]):
            segments.append((float(a[0]), float(a[1]), float(b[0]), float(b[1])))
    return segments


def _length(s) -> float:
    return float(np.hypot(s[2] - s[0], s[3] - s[1]))


def _aligned(s, degrees: float = 5.0) -> bool:
    """Within a few degrees of horizontal or vertical (welding nudges endpoints slightly)."""
    dx, dy = abs(s[2] - s[0]), abs(s[3] - s[1])
    tolerance = np.tan(np.radians(degrees))
    return dy <= dx * tolerance or dx <= dy * tolerance


def _axis_snap(segments: list, degrees: float = 4.0) -> list:
    out = []
    tolerance = np.tan(np.radians(degrees))
    for x1, y1, x2, y2 in segments:
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if dy <= dx * tolerance:
            y = (y1 + y2) / 2
            y1 = y2 = y
        elif dx <= dy * tolerance:
            x = (x1 + x2) / 2
            x1 = x2 = x
        out.append((x1, y1, x2, y2))
    return out


def _weld(segments: list, tolerance: float) -> list:
    """Moves endpoints closer than `tolerance` onto their shared mean, so walls meet."""
    if not segments:
        return []
    points = np.array([p for s in segments for p in ((s[0], s[1]), (s[2], s[3]))], np.float64)
    parent = list(range(len(points)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # Hash points into tolerance-sized buckets: a partner can only sit in the 3x3 buckets around.
    buckets = {}
    for i, (x, y) in enumerate(points):
        buckets.setdefault((int(x // tolerance), int(y // tolerance)), []).append(i)
    for (bx, by), members in buckets.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in buckets.get((bx + dx, by + dy), ()):
                    for i in members:
                        if i < j and math.hypot(points[j, 0] - points[i, 0], points[j, 1] - points[i, 1]) <= tolerance:
                            parent[find(i)] = find(j)
    groups = {}
    for i in range(len(points)):
        groups.setdefault(find(i), []).append(i)
    for members in groups.values():
        points[members] = points[members].mean(axis=0)
    out = []
    for k in range(len(segments)):
        a, b = points[2 * k], points[2 * k + 1]
        if np.hypot(*(b - a)) > 1e-6:
            out.append((a[0], a[1], b[0], b[1]))
    return out


def _merge_collinear(segments: list, degrees: float = 6.0) -> list:
    """Joins two segments meeting end to end at a point no other segment uses, when nearly straight."""
    segs = [tuple(round(v, 3) for v in s) for s in segments]
    cos_limit = np.cos(np.radians(degrees))
    changed = True
    while changed:
        changed = False
        ends = {}
        for i, s in enumerate(segs):
            ends.setdefault((s[0], s[1]), []).append(i)
            ends.setdefault((s[2], s[3]), []).append(i)
        for point, members in ends.items():
            if len(members) != 2:
                continue
            i, j = members
            a = segs[i] if (segs[i][2], segs[i][3]) == point else (segs[i][2], segs[i][3], segs[i][0], segs[i][1])
            b = segs[j] if (segs[j][0], segs[j][1]) == point else (segs[j][2], segs[j][3], segs[j][0], segs[j][1])
            u = np.array([a[2] - a[0], a[3] - a[1]])
            v = np.array([b[2] - b[0], b[3] - b[1]])
            nu, nv = np.linalg.norm(u), np.linalg.norm(v)
            if nu == 0 or nv == 0 or float(u @ v) / (nu * nv) < cos_limit:
                continue
            merged = (a[0], a[1], b[2], b[3])
            segs = [s for k, s in enumerate(segs) if k not in (i, j)] + [merged]
            changed = True
            break
    return segs


def _drop_stairs(segments: list, cell: float) -> list:
    """Removes stair treads: three or more short parallel pieces, closely and evenly stacked."""
    short = [i for i, s in enumerate(segments) if _length(s) < cell * 4 and _aligned(s)]
    drop = set()
    for i in short:
        a = segments[i]
        horizontal = abs(a[3] - a[1]) <= abs(a[2] - a[0])
        neighbours = []
        for j in short:
            b = segments[j]
            if j == i or (abs(b[3] - b[1]) <= abs(b[2] - b[0])) != horizontal:
                continue
            gap = abs(b[1] - a[1]) if horizontal else abs(b[0] - a[0])
            lo_a, hi_a = sorted((a[0], a[2])) if horizontal else sorted((a[1], a[3]))
            lo_b, hi_b = sorted((b[0], b[2])) if horizontal else sorted((b[1], b[3]))
            overlap = min(hi_a, hi_b) - max(lo_a, lo_b)
            if 0 < gap < cell * 0.45 and overlap > 0.5 * min(hi_a - lo_a, hi_b - lo_b):
                neighbours.append(j)
        if len(neighbours) >= 2:
            drop.add(i)
            drop.update(neighbours)
    return [s for i, s in enumerate(segments) if i not in drop]


def _segments_for(runs: np.ndarray, cell: float) -> list:
    if not runs.any():
        return []
    segments = _simplify(_trace(_thin(runs)), max(1.5, cell * 0.06))
    segments = _axis_snap(segments)
    segments = _weld(segments, cell * 0.25)
    segments = _merge_collinear(segments)
    segments = _drop_stairs(segments, cell)
    segments = [s for s in segments if _length(s) >= cell * 0.6]
    return _connected_to_long_runs(segments, cell)


def _score(segments: list, cell: float) -> float:
    """Wall found, in cells: only axis-aligned runs at least two cells long, which noise rarely makes."""
    return sum(_length(s) / cell for s in segments if _aligned(s) and _length(s) >= 2 * cell)


def _connected_to_long_runs(segments: list, cell: float) -> list:
    """Keeps straight pieces a cell or longer, and shorter ones only in a network with a long run."""
    key = lambda x, y: (round(x, 1), round(y, 1))
    parent = list(range(len(segments)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for i, s in enumerate(segments):
        for point in (key(s[0], s[1]), key(s[2], s[3])):
            if point in owner:
                parent[find(i)] = find(owner[point])
            else:
                owner[point] = i
    anchored = {find(i) for i, s in enumerate(segments) if _aligned(s) and _length(s) >= 1.5 * cell}
    return [s for i, s in enumerate(segments) if find(i) in anchored or (_aligned(s) and _length(s) >= cell)]


def _working_cell(width: int, height: int, cell: float, scale: float) -> float:
    """The cell size in working pixels, kept within sane bounds when the grid is unknown or odd."""
    edge = max(width, height) * scale
    fallback = edge / 40
    value = cell * scale if cell and cell > 0 else fallback
    return float(min(max(value, 12.0), edge / 6))


def detect_walls(image: np.ndarray, cell: float = 0.0, sample: dict = None, tolerance: float = SAMPLE_TOLERANCE,
                 strictness: float = OUTLINE_SHARE, min_length: float = 0.0) -> dict:
    """Wall segments in the image's own pixels. `cell` is the grid's cell size in those pixels, or 0.

    With `sample` ({x, y} in image pixels, on a wall the GM clicked) the mask comes from that
    wall's colour within `tolerance`; without it, the bright and dark styles are both tried and the
    better one wins. `strictness` is the share of a run's edge that must follow an outline, and
    `min_length` (in cells) drops shorter walls from the result.
    """
    height, width = image.shape[:2]
    scale = min(1.0, WORK_EDGE / max(width, height))
    work = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    working_cell = _working_cell(width, height, cell, scale)
    gray = cv2.bilateralFilter(cv2.cvtColor(work, cv2.COLOR_BGR2GRAY), 7, 25, 5)
    best = ("none", [], 0.0)
    candidates = (
        [("sample", _sampled_mask(work, gray, working_cell, (sample["x"] * scale, sample["y"] * scale), tolerance, strictness), working_cell)]
        if sample else _wall_masks(gray, working_cell, strictness)
    )
    for name, mask, c in candidates:
        segments = _segments_for(mask, c)
        score = _score(segments, c)
        if score > best[2]:
            best = (name, segments, score)
    name, segments, score = best
    # A handful of short pieces is noise, not a wall layout. A sample says walls exist, so it
    # keeps whatever long run it found.
    if score < (2 if sample else 4):
        segments = []
    segments = [s for s in segments if _length(s) >= min_length * working_cell]
    segments.sort(key=_length, reverse=True)
    walls = []
    for x1, y1, x2, y2 in segments[:MAX_WALLS]:
        clip = lambda v, hi: float(min(max(v / scale, 0.0), hi))
        a = {"x": round(clip(x1, width), 1), "y": round(clip(y1, height), 1)}
        b = {"x": round(clip(x2, width), 1), "y": round(clip(y2, height), 1)}
        if a != b:
            walls.append({"a": a, "b": b})
    return {"walls": walls, "mask": name, "score": round(score, 1)}


def render_preview(image: np.ndarray, walls: list) -> dict:
    """The map, dimmed, with the detected walls drawn on it, as a JPEG for the GM to review."""
    height, width = image.shape[:2]
    scale = min(1.0, PREVIEW_EDGE / max(width, height))
    preview = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image.copy()
    preview = cv2.addWeighted(preview, 0.55, np.zeros_like(preview), 0.45, 0)
    thickness = max(2, int(round(max(preview.shape[:2]) / 340)))
    points = []
    for wall in walls:
        a = (int(round(wall["a"]["x"] * scale)), int(round(wall["a"]["y"] * scale)))
        b = (int(round(wall["b"]["x"] * scale)), int(round(wall["b"]["y"] * scale)))
        cv2.line(preview, a, b, (20, 20, 20), thickness + 3, cv2.LINE_AA)
        cv2.line(preview, a, b, (40, 90, 255), thickness, cv2.LINE_AA)
        points.extend((a, b))
    for p in set(points):
        cv2.circle(preview, p, thickness + 1, (255, 255, 255), -1, cv2.LINE_AA)
    ok, encoded = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise ValueError("Could not encode preview")
    return {
        "contentType": "image/jpeg",
        "width": int(preview.shape[1]),
        "height": int(preview.shape[0]),
        "data": base64.b64encode(encoded.tobytes()).decode("ascii"),
    }


def _detected_cell(data: bytes, width: int, height: int) -> float:
    from detector import detect_bytes
    try:
        result = detect_bytes(data, width, height)
    except ValueError:
        return 0.0
    return float(result["cellSize"]) if result.get("kind") == "candidate" else 0.0


def analyze(data: bytes, width: int, height: int, cell: float = 0.0, sample: dict = None,
            tolerance: float = SAMPLE_TOLERANCE, strictness: float = OUTLINE_SHARE, min_length: float = 0.0) -> dict:
    """One job: decode, detect, render. The result shape is `WallDetectionResult` in packages/shared.

    `cell` is the room grid's cell size; without one, the grid detector's suggestion is used.
    `sample` is a point on a wall the GM clicked, in image pixels, or None; `tolerance` is its colour range.
    `strictness` and `min_length` are the outline share and shortest wall, in cells (detect_walls).
    """
    image = decode(data, width, height)
    if not cell:
        cell = _detected_cell(data, width, height)
    if sample is not None and not (0 <= sample["x"] <= width and 0 <= sample["y"] <= height):
        raise ValueError("Sample outside the image")
    detected = detect_walls(image, cell, sample, tolerance, strictness, min_length)
    return {"walls": detected["walls"], "preview": render_preview(image, detected["walls"])}
