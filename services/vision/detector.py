"""Bounded square-grid detection in original image pixel coordinates."""

import os
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "40000000")

import cv2
import numpy as np

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_EDGE = 16_384
MIN_CELL = 8
MAX_CELL = 2000


def _axis_profile(gray: np.ndarray, vertical: bool) -> np.ndarray:
    # Sample across the whole map: printed lines persist across rows/columns,
    # while terrain and compression artifacts mostly average away.
    if vertical:
        sampled = gray[::max(1, gray.shape[0] // 768), :]
        mean = sampled.astype(np.float32).mean(axis=0)
    else:
        sampled = gray[:, ::max(1, gray.shape[1] // 768)]
        mean = sampled.astype(np.float32).mean(axis=1)
    smooth = cv2.GaussianBlur(mean.reshape(1, -1), (0, 0), 3.0).ravel()
    profile = np.abs(mean - smooth)
    # A small blur joins the two edges of a broad printed line.
    return cv2.GaussianBlur(profile.reshape(1, -1), (3, 1), 0.7).ravel()


def _period_candidates(profile: np.ndarray) -> list:
    n = len(profile)
    largest = min(MAX_CELL, n // 3)
    if largest < MIN_CELL or float(profile.max()) < 0.15:
        return []
    centered = profile - np.median(profile)
    spectrum = np.fft.rfft(centered, n=2 * n)
    corr = np.fft.irfft(spectrum * np.conj(spectrum), n=2 * n)[:n]
    norm = float(corr[0]) + 1e-6
    # Local maxima suppress nearby lags caused by thick lines.
    scores = corr / norm
    peaks = []
    for cell in range(MIN_CELL, largest + 1):
        if scores[cell] >= scores[cell - 1] and scores[cell] >= scores[cell + 1]:
            peaks.append((float(scores[cell]), cell))
    peaks.sort(reverse=True)
    return peaks[:24]


def _phase(profile: np.ndarray, cell: int) -> tuple:
    indices = np.arange(len(profile)) % cell
    sums = np.bincount(indices, weights=profile, minlength=cell)
    counts = np.bincount(indices, minlength=cell)
    folded = sums / np.maximum(counts, 1)
    phase = int(np.argmax(folded))
    baseline = float(np.median(folded)) + 0.05
    contrast = float(folded[phase] / baseline)
    # Check that evidence is distributed over the map, not one decorated patch.
    positions = np.arange(phase, len(profile), cell)
    evidence = profile[positions]
    coverage = float(np.mean(evidence > baseline * 1.5)) if len(evidence) else 0.0
    return phase, contrast, coverage


def detect(gray: np.ndarray) -> dict:
    if gray.ndim != 2:
        raise ValueError("Expected a grayscale image")
    height, width = gray.shape
    if width > MAX_EDGE or height > MAX_EDGE or width * height > MAX_PIXELS:
        raise ValueError("Image exceeds analysis dimensions")
    x_profile = _axis_profile(gray, True)
    y_profile = _axis_profile(gray, False)
    xs = _period_candidates(x_profile)
    ys = _period_candidates(y_profile)
    if not xs or not ys:
        return {"kind": "no_grid"}

    best = None
    for x_score, x_cell in xs:
        for y_score, y_cell in ys:
            if abs(x_cell - y_cell) > 2:
                continue
            cell = int(round((x_cell + y_cell) / 2))
            if cell < MIN_CELL or (width + height) / cell + 2 > 50_000:
                continue
            x_phase, x_contrast, x_cover = _phase(x_profile, cell)
            y_phase, y_contrast, y_cover = _phase(y_profile, cell)
            # A repeated art motif or stripe in just one direction is insufficient.
            if min(x_score, y_score) < 0.13 or min(x_contrast, y_contrast) < 1.8:
                continue
            if min(x_cover, y_cover) < 0.45:
                continue
            # Favor the fundamental over its multiples when evidence is comparable.
            quality = min(x_score, y_score) * min(x_contrast, y_contrast) * min(x_cover, y_cover)
            quality /= 1 + 0.00015 * cell
            if best is None or quality > best[0]:
                confidence = min(0.99, max(0.35, 0.38 + 0.28 * min(x_score, y_score)
                                            + 0.12 * min(x_contrast, y_contrast)
                                            + 0.18 * min(x_cover, y_cover)))
                best = (quality, {
                    "kind": "candidate", "cellSize": cell,
                    "offsetX": x_phase % cell, "offsetY": y_phase % cell,
                    "confidence": round(confidence, 3),
                })
    return best[1] if best else {"kind": "no_grid"}


def detect_bytes(data: bytes, width: int, height: int) -> dict:
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Image exceeds analysis byte limit")
    if width <= 0 or height <= 0 or width > MAX_EDGE or height > MAX_EDGE or width * height > MAX_PIXELS:
        raise ValueError("Image exceeds analysis dimensions")
    gray = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if gray is None or gray.shape != (height, width):
        raise ValueError("Invalid image or declared dimensions")
    return detect(gray)
