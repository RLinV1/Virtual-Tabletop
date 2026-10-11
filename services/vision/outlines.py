"""Wall extraction for maps drawn with inked outlines (FR-GM-11, ADR 0029): the "Inked outlines" style.

Adapted from ThreeHats/auto-wall (MIT, see THIRD_PARTY_NOTICES.md): from
src/wall_detection/detector.py (detect_walls, create_color_mask, create_multi_color_mask,
process_contours_with_hierarchy, merge_contours, remove_hatching_lines) and from
src/wall_detection/mask_editor.py (contours_to_foundry_walls, merge_collinear_walls). Its Qt GUI,
export, light and background-removal code are not used.

auto-wall finds walls by colour or by edges and turns their contours into segments. That suits
battle maps drawn in ink: buildings, caves and rooms outlined in a dark line, where walls.py's
search for raised stone finds little. Pipeline:

1. Detection presets (PRESETS, the analogue of auto-wall's detection_presets.json). Colour
   detection keeps pixels near a wall colour (dark ink first, then the map's dominant colours);
   edge detection (Canny) finds the outline of silhouettes such as caves and cliffs. Thin lines of
   the wall colour (grid lines, hatching) are painted over first, regions under a minimum area are
   dropped, and nearby ones are merged.
2. Contours to segments. Strokes thinner than a wall are thinned to centrelines, so a stroke gives
   one wall, not the two sides of a contour; wider regions give their outline, as in auto-wall.
   Douglas-Peucker simplification, nearby endpoints merged, collinear pieces joined.
3. walls.py's cleanup: axis snapping, welding, dropping stair hatching and scraps not joined to a
   long run, segments along the image border, and the MAX_WALLS cap.

The presets run in order until one finds enough wall, else the best wins.
"""

import cv2
import numpy as np

from walls import (
    MAX_WALLS, WORK_EDGE, _aligned, _axis_snap, _drop_stairs, _kernel, _length, _merge_collinear,
    _straight_runs, _weld, _working_cell,
)

# Regions of a colour wider than this, in cells, are floor, not wall.
STROKE_CELLS = 1.0


# Mean brightness below which a map colour is ink (the ink preset's), and the colour threshold
# for the map's other dominant colours.
DARK_INK = 70


PALETTE_THRESHOLD = 15.0


# Detection presets for battle maps, in auto-wall's terms. Sizes are in cells, so they follow the
# grid. `colors` are BGR with auto-wall's per-colour threshold; `canny` its two thresholds;
# `min_area` auto-wall's minimum contour area; `merge` its minimum merge distance;
# `hatching` the width of the thin lines of the wall colour that are painted over first.
# `max_edge_density` is how much of the map may be Canny edges for edge detection to apply: auto-wall
# advises it for maps with clear wall lines, and a busy painted map has edges everywhere.
PRESETS = (
    {"name": "edge", "mode": "edge", "blur": 5, "canny": (50, 150), "min_area": 0.5, "merge": 0.0, "max_edge_density": 0.04,
     "accept": 15.0},
    {"name": "ink", "mode": "color", "colors": [((30, 30, 35), 20.0)], "min_area": 0.02, "merge": 0.1, "hatching": 0.05,
     "accept": 30.0},
)


def create_color_mask(image: np.ndarray, target_color: tuple, threshold: float) -> np.ndarray:
    """Pixels near `target_color` (BGR) are 255. `threshold` is auto-wall's 0-100 scale.

    From auto-wall's create_color_mask: an RGB distance whose reach shrinks for darker colours,
    with extra care for near-black, then a small close and open to fill holes and drop specks.
    """
    is_dark_target = sum(target_color) < 60
    b, g, r = (c.astype(np.float32) for c in cv2.split(image))
    if is_dark_target and ((b <= 30) & (g <= 30) & (r <= 30)).any():
        # Near-black pixels are pulled together so PNG, WebP and JPEG blacks match alike.
        b, g, r = b * 0.9, g * 0.9, r * 0.9
    if threshold == 0:
        return ((b == target_color[0]) & (g == target_color[1]) & (r == target_color[2])).astype(np.uint8) * 255
    max_distance = 255.0 * np.sqrt(3)
    intensity = sum(target_color) / 3.0
    divisor = 5.0 if intensity < 15 else 4.0 if intensity < 30 else 3.0 if intensity < 85 else 2.5
    reach = (threshold / 100.0) * (max_distance / divisor)
    db, dg, dr = b - target_color[0], g - target_color[1], r - target_color[2]
    if is_dark_target:
        distance = np.sqrt(0.8 * (db * db + dg * dg + dr * dr))
        distance = np.maximum(distance - np.exp(-((b + g + r) / 3 / 30.0)) * 20, 0)
    else:
        distance = np.sqrt(db * db + dg * dg + dr * dr)
    mask = (distance <= reach).astype(np.uint8) * 255
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)


def create_multi_color_mask(image: np.ndarray, colors: list) -> np.ndarray:
    """The union of `create_color_mask` over ((B, G, R), threshold) pairs."""
    combined = np.zeros(image.shape[:2], np.uint8)
    for color, threshold in colors:
        combined = cv2.bitwise_or(combined, create_color_mask(image, color, threshold))
    return combined


def remove_hatching_lines(image: np.ndarray, color: tuple, threshold: float, max_width: int) -> np.ndarray:
    """Paints over lines of `color` no wider than about `max_width` pixels (auto-wall's hatching removal).

    Lines are what a morphological opening takes out of the colour mask; they are replaced by a
    grey unlike the colour, so they are not taken for walls.
    """
    color_mask = create_color_mask(image, color, threshold)
    size = max(3, max_width * 2)
    size += 1 - size % 2
    opened = cv2.morphologyEx(color_mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    hatching = cv2.subtract(color_mask, opened) > 0
    if not hatching.any():
        return image
    average = sum(color) / 3
    replacement = 180 if average < 85 else 120 if average > 170 else 255 - np.array(color, np.uint8)
    result = image.copy()
    result[hatching] = replacement
    return result


def process_contours_with_hierarchy(contours: list, hierarchy, min_area: float) -> list:
    """(contour, is_hole) for the contours of at least `min_area`, outer and inner (auto-wall's hierarchy pass)."""
    if not contours:
        return []
    parents = hierarchy[0][:, 3] if hierarchy is not None else [-1] * len(contours)
    return [(c, parents[i] != -1) for i, c in enumerate(contours) if cv2.contourArea(c) >= min_area]


def _fill(shape: tuple, contours: list) -> np.ndarray:
    """A mask of the kept contours: outer ones filled, holes cut out again."""
    mask = np.zeros(shape, np.uint8)
    for contour, is_hole in contours:
        if not is_hole:
            cv2.drawContours(mask, [contour], -1, 255, cv2.FILLED)
    for contour, is_hole in contours:
        if is_hole:
            cv2.drawContours(mask, [contour], -1, 0, cv2.FILLED)
    return mask


def merge_contours(mask: np.ndarray, distance: float) -> np.ndarray:
    """Nearby regions are merged by dilating the mask (auto-wall's merge_contours)."""
    if distance < 1:
        return mask
    size = max(3, int(distance)) | 1
    return cv2.dilate(mask, np.ones((size, size), np.uint8))


def detect_mask(image: np.ndarray, preset: dict, cell: float) -> np.ndarray:
    """The wall mask of one preset: auto-wall's detect_walls, with its contours kept as a mask."""
    min_area = preset["min_area"] * cell * cell
    if preset["mode"] == "color":
        if preset.get("hatching"):
            width = max(1, int(round(preset["hatching"] * cell)))
            for color, threshold in preset["colors"]:
                image = remove_hatching_lines(image, color, threshold, width)
        mask = create_multi_color_mask(image, preset["colors"])
        contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        mask = _fill(mask.shape, process_contours_with_hierarchy(contours, hierarchy, min_area))
        # Walls are strokes: regions wider than a wall (a floor of the same colour) are not.
        mask = _strokes(mask, cell)
        if preset.get("straight"):
            mask = _straight_runs(mask, cell)
        if preset.get("outlined"):
            mask = _outlined(mask, _dark_outline(image, cell))
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (preset["blur"],) * 2, 0)
        edges = cv2.Canny(blurred, *preset["canny"])
        if np.count_nonzero(edges) > preset["max_edge_density"] * edges.size:
            return np.zeros(gray.shape, np.uint8)
        contours, _ = cv2.findContours(edges, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        filled = np.zeros(gray.shape, np.uint8)
        cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
        filled = cv2.dilate(filled, np.ones((3, 3), np.uint8))
        _, labels, stats, _ = cv2.connectedComponentsWithStats(filled)
        keep = stats[:, cv2.CC_STAT_AREA] >= min_area
        keep[0] = False
        mask = np.where(keep[labels], 255, 0).astype(np.uint8)
    return merge_contours(mask, preset["merge"] * cell)


def _strokes(mask: np.ndarray, cell: float) -> np.ndarray:
    """The mask without its regions wider than a wall."""
    wide = cv2.morphologyEx(mask, cv2.MORPH_OPEN, _kernel(cell * STROKE_CELLS, shape=cv2.MORPH_ELLIPSE))
    return cv2.subtract(mask, cv2.dilate(wide, _kernel(cell * 0.2)))


def _dark_outline(image: np.ndarray, cell: float) -> np.ndarray:
    """Thin dark lines clearly darker than their surroundings, which drawn walls have along their edges."""
    gray = cv2.bilateralFilter(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 7, 25, 5)
    lines = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, _kernel(cell * 0.25, shape=cv2.MORPH_ELLIPSE))
    otsu, _ = cv2.threshold(lines, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    strong = lines > max(otsu, float(lines.mean() + lines.std()), 20.0)
    return cv2.dilate(strong.astype(np.uint8) * 255, _kernel(3))


def _outlined(mask: np.ndarray, outline: np.ndarray, share: float = 0.3) -> np.ndarray:
    """Keeps the components whose boundary mostly runs along a contrasting outline."""
    count, labels = cv2.connectedComponents(mask, connectivity=8)
    boundary = cv2.subtract(mask, cv2.erode(mask, _kernel(3))) > 0
    total = np.bincount(labels[boundary], minlength=count).astype(np.float64)
    touching = np.bincount(labels[boundary & (outline > 0)], minlength=count).astype(np.float64)
    keep = touching >= share * np.maximum(total, 1)
    keep[0] = False
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def _palette(work: np.ndarray, cell: float, count: int = 6) -> list:
    """Presets for the map's dominant light colours: stone walls auto-wall's user would pick by eye.

    k-means over a small copy of the map. Dark colours are the ink preset's, so are skipped; a
    light wall is told from a floor of the same colour by its dark outline and its straight run.
    """
    small = cv2.resize(cv2.GaussianBlur(work, (0, 0), 2), (160, max(1, int(160 * work.shape[0] / work.shape[1]))),
                       interpolation=cv2.INTER_AREA)
    data = small.reshape(-1, 3).astype(np.float32)
    cv2.setRNGSeed(0)
    _, _, centres = cv2.kmeans(data, count, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 12, 1.0),
                               2, cv2.KMEANS_PP_CENTERS)
    presets = []
    for i, centre in enumerate(centres):
        color = tuple(int(v) for v in centre)
        if sum(color) / 3 < DARK_INK:
            continue
        presets.append({"name": f"colour{i}", "mode": "color", "colors": [(color, PALETTE_THRESHOLD)], "min_area": 0.02,
                        "merge": 0.1, "hatching": 0.0, "straight": True, "outlined": True})
    return presets


def _join_gaps(segments: list, max_gap: float, degrees: float = 3.0, offset: float = 2.0) -> list:
    """Joins collinear segments whose ends are within `max_gap` (auto-wall's merge_collinear_walls).

    Auto-wall judges collinearity by angle alone; here the pieces must also lie on one line.
    """
    segs = np.array(segments, np.float64).reshape(-1, 4)
    cos_limit = np.cos(np.radians(degrees))
    while len(segs) > 1:
        a, b = segs[:, None, :], segs[None, :, :]
        u, v = a[..., 2:] - a[..., :2], b[..., 2:] - b[..., :2]
        nu, nv = np.linalg.norm(u, axis=-1), np.linalg.norm(v, axis=-1)
        parallel = np.abs((u * v).sum(-1)) >= cos_limit * np.maximum(nu * nv, 1e-9)
        gap = np.minimum.reduce([np.linalg.norm(a[..., p:p + 2] - b[..., q:q + 2], axis=-1) for p in (0, 2) for q in (0, 2)])
        normal = np.stack([-u[..., 1], u[..., 0]], -1) / np.maximum(nu, 1e-9)[..., None]
        off = np.maximum(*(np.abs(((b[..., q:q + 2] - a[..., :2]) * normal).sum(-1)) for q in (0, 2)))
        ok = np.triu(parallel & (gap <= max_gap) & (off <= offset), 1)
        pairs = np.argwhere(ok)
        if not len(pairs):
            break
        used, merged, drop = set(), [], set()
        for i, j in pairs:
            if i in used or j in used:
                continue
            used.update((i, j))
            pts = np.array([segs[i][:2], segs[i][2:], segs[j][:2], segs[j][2:]])
            p, q = max(((p, q) for p in range(4) for q in range(p + 1, 4)),
                       key=lambda pq: np.hypot(*(pts[pq[0]] - pts[pq[1]])))
            merged.append(np.concatenate([pts[p], pts[q]]))
            drop.update((i, j))
        segs = np.array([s for k, s in enumerate(segs) if k not in drop] + merged)
    return [tuple(map(float, s)) for s in segs]


def _outline_segments(mask: np.ndarray, epsilon: float) -> list:
    """Segments along the outlines of a mask's regions (auto-wall's contours_to_foundry_walls).

    Each contour is simplified (Douglas-Peucker) and its edges become wall segments.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    segments = []
    for contour in contours:
        points = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
        if len(points) < 2:
            continue
        for a, b in zip(points, np.roll(points, -1, axis=0)):
            segments.append((float(a[0]), float(a[1]), float(b[0]), float(b[1])))
    return segments


def _off_border(segments: list, width: int, height: int, margin: float = 2.5) -> list:
    """Drops segments lying along the image border, which only mark where a region was cut off."""
    def along(s):
        return (max(s[0], s[2]) <= margin or min(s[0], s[2]) >= width - 1 - margin
                or max(s[1], s[3]) <= margin or min(s[1], s[3]) >= height - 1 - margin)
    return [s for s in segments if not along(s)]


def _mask_segments(mask: np.ndarray, cell: float) -> list:
    """Wall segments along the outlines of a mask, without those that only follow the image border."""
    height, width = mask.shape
    return _off_border(_outline_segments(mask, max(1.5, cell * 0.1)), width, height)


def _collapse_doubles(segments: list, max_dist: float, degrees: float = 8.0) -> list:
    """Replaces the two outlines of a thin stroke by the stroke's centreline.

    A contour runs along both sides of a stroke, which would make two walls where the map has
    one. Near-parallel segments closer than `max_dist` that overlap are replaced by the line
    midway between them, over their overlap; auto-wall leaves this to the GM.
    """
    segs = np.array(segments, np.float64).reshape(-1, 4)
    cos_limit = np.cos(np.radians(degrees))
    for _ in range(8):
        n = len(segs)
        if n < 2:
            break
        mid = (segs[:, :2] + segs[:, 2:]) / 2
        vec = segs[:, 2:] - segs[:, :2]
        length = np.maximum(np.linalg.norm(vec, axis=1), 1e-9)
        unit = vec / length[:, None]
        normal = np.stack([-unit[:, 1], unit[:, 0]], 1)
        pairs = []
        for start in range(0, n, 256):
            rows = slice(start, min(start + 256, n))
            cos = np.abs(unit[rows] @ unit.T)
            offset = np.einsum("ijk,ik->ij", mid[None, :, :] - mid[rows, None, :], normal[rows])
            along = np.einsum("ijk,ik->ij", mid[None, :, :] - mid[rows, None, :], unit[rows])
            # Overlap of the two spans along segment i's direction.
            overlap = (length[rows, None] + length[None, :]) / 2 - np.abs(along)
            ok = (cos >= cos_limit) & (np.abs(offset) <= max_dist) & (np.abs(offset) > 0.01) \
                & (overlap >= 0.5 * np.minimum(length[rows, None], length[None, :]))
            ok &= np.arange(start, min(start + 256, n))[:, None] < np.arange(n)[None, :]
            pairs.extend((start + i, j) for i, j in np.argwhere(ok))
        if not pairs:
            break
        used, drop, merged = set(), set(), []
        for i, j in pairs:
            if i in used or j in used:
                continue
            if length[j] > length[i]:
                i, j = j, i
            used.update((i, j))
            drop.update((i, j))
            d, nrm = unit[i], normal[i]
            ts = [float((segs[k][c:c + 2] - mid[i]) @ d) for k in (i, j) for c in (0, 2)]
            lo, hi = max(min(ts[0], ts[1]), min(ts[2], ts[3])), min(max(ts[0], ts[1]), max(ts[2], ts[3]))
            shift = float((mid[j] - mid[i]) @ nrm) / 2
            if hi <= lo:
                merged.append(segs[i])
                merged.append(segs[j])
                continue
            merged.append(np.concatenate([mid[i] + d * lo + nrm * shift, mid[i] + d * hi + nrm * shift]))
            # The longer segment keeps what the shorter one did not cover, to be paired in turn.
            for start, end in ((min(ts[0], ts[1]), lo), (hi, max(ts[0], ts[1]))):
                if end - start > 1.0:
                    merged.append(np.concatenate([mid[i] + d * start, mid[i] + d * end]))
        segs = np.array([s for k, s in enumerate(segs) if k not in drop] + merged).reshape(-1, 4)
    return [tuple(map(float, s)) for s in segs]


def _connected_to_long_runs(segments: list, cell: float) -> list:
    """Keeps pieces 1.5 cells or longer, and shorter ones only in a network with a run of 2.5 cells
    or enough length overall (a curved wall is many short pieces)."""
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
    total, longest = {}, {}
    for i, s in enumerate(segments):
        root = find(i)
        total[root] = total.get(root, 0.0) + _length(s)
        longest[root] = max(longest.get(root, 0.0), _length(s))
    anchored = {r for r in total if longest[r] >= 2.5 * cell or total[r] >= 6 * cell}
    return [s for i, s in enumerate(segments) if find(i) in anchored or _length(s) >= 1.5 * cell]


def _segments_for(mask: np.ndarray, cell: float) -> list:
    if not mask.any():
        return []
    segments = _mask_segments(mask, cell)
    segments = [s for s in segments if _length(s) >= cell * 0.15]
    segments = _collapse_doubles(segments, cell * 0.5)
    segments = _axis_snap(segments)
    segments = _weld(segments, cell * 0.25)
    segments = _join_gaps(_merge_collinear(segments), cell * 0.3)
    segments = _drop_stairs(segments, cell)
    segments = [s for s in segments if _length(s) >= cell * 0.6]
    return _connected_to_long_runs(segments, cell)


def _score(segments: list, cell: float) -> float:
    """Wall found, in cells: only straight runs at least two cells long, which noise rarely makes."""
    return sum(_length(s) / cell for s in segments if _length(s) >= 2 * cell)


def detect_outlines(image: np.ndarray, cell: float = 0.0, min_length: float = 0.0) -> dict:
    """Wall segments in the image's own pixels, from its inked outlines. `cell` is the grid's cell
    size in those pixels, or 0; `min_length` (in cells) drops shorter walls.

    auto-wall itself ignores the grid. A room's grid is often still the default, or a misread one,
    when walls are first detected, and a cell far too large blurs every outline away; so a given
    cell is tried beside the size estimated from the image, and the better-scoring result is kept.
    """
    if cell and cell > 0:
        given = _detect_outlines(image, cell, min_length)
        estimated = _detect_outlines(image, 0.0, min_length)
        return given if given["score"] >= estimated["score"] else estimated
    return _detect_outlines(image, 0.0, min_length)


def _detect_outlines(image: np.ndarray, cell: float, min_length: float) -> dict:
    height, width = image.shape[:2]
    scale = min(1.0, WORK_EDGE / max(width, height))
    work = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    cell_px = _working_cell(width, height, cell, scale)
    best = ("none", [], 0.0)
    for group in [[preset] for preset in PRESETS] + [None]:
        for preset in _palette(work, cell_px) if group is None else group:
            segments = _segments_for(detect_mask(work, preset, cell_px), cell_px)
            score = _score(segments, cell_px)
            if score > best[2]:
                best = (preset["name"], segments, score)
        if group is not None and best[2] >= group[0].get("accept", 0.0) > 0:
            break
    name, segments, score = best
    # A handful of short pieces is noise, not a wall layout.
    if score < 4:
        segments = []
    segments = [s for s in segments if _length(s) >= min_length * cell_px]
    segments.sort(key=_length, reverse=True)
    walls = []
    for x1, y1, x2, y2 in segments[:MAX_WALLS]:
        clip = lambda v, hi: float(min(max(v / scale, 0.0), hi))
        a = {"x": round(clip(x1, width), 1), "y": round(clip(y1, height), 1)}
        b = {"x": round(clip(x2, width), 1), "y": round(clip(y2, height), 1)}
        if a != b:
            walls.append({"a": a, "b": b})
    return {"walls": walls, "mask": f"outlines:{name}", "score": round(score, 1)}
