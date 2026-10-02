import { describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { drawGridSample, seedGridSample } from "../src/pages/gridSample";
import { beginPointerGesture, CLICK_MOVEMENT_LIMIT, EMPTY_GESTURE, EMPTY_PLACEMENT,
  finishPointerGesture, interruptPointerGesture, movePointerGesture, transitionPlacement, type Placement } from "../src/pages/gridSampleInteraction";

const map = { width: 1000, height: 800 };
const a = { x: 425.5, y: 315.75 };
const b = { x: 635.875, y: 420.25 };
const place = (state: Placement, point = a, count: 1 | 3 | 5 = 3) =>
  transitionPlacement(state, { type: "place", point }, count, DEFAULT_GRID, map);
const pending = place(EMPTY_PLACEMENT).placement;
const placed = place(pending, b).placement;
const select = (anchor: "A" | "B") => transitionPlacement(placed, { type: "select", anchor }, 3, DEFAULT_GRID, map).placement;
const press = (id = 1, type = "mouse") => ({ id, type, start: { x: 10, y: 20 }, current: { x: 10, y: 20 }, anchor: null });

describe("two-click anchors", () => {
  it("places A without a draft, then commits fractional square geometry on B", () => {
    const first = place(EMPTY_PLACEMENT);
    expect(first).toEqual({ placement: { stage: "awaiting-b", anchor: a } });
    const second = place(first.placement, b);
    expect(second.placement.stage).toBe("placed");
    expect(second.grid).toMatchObject({ cellSize: 70.125, offsetX: 4.75, offsetY: 35.25 });
    expect(place(second.placement, { x: 800, y: 600 })).toEqual({ placement: second.placement });
  });

  it.each([[1, 1], [-1, 1], [1, -1], [-1, -1]])("finalizes a square in quadrant %s, %s", (sx, sy) => {
    const result = place(pending, { x: a.x + sx * 210.375, y: a.y + sy * 100.25 });
    expect(result.grid?.cellSize).toBe(70.125);
    expect("sample" in result.placement && result.placement.sample.corner).toEqual({ x: a.x + sx * 210.375, y: a.y + sy * 210.375 });
  });

  it("retains A after an invalid B and permits retry", () => {
    const invalid = place(pending, a);
    expect(invalid).toEqual({ placement: pending, invalid: true });
    expect(place(invalid.placement, b).grid?.cellSize).toBe(70.125);
    expect(place(EMPTY_PLACEMENT, { x: -1, y: 100 })).toEqual({ placement: EMPTY_PLACEMENT, invalid: true });
  });

  it("seeds toward the interior at each image corner", () => {
    for (const point of [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 800 }, { x: 1000, y: 800 }]) {
      const seed = seedGridSample(point, 70.125, 3, map)!;
      expect(Math.abs(seed.corner.x - seed.anchor.x)).toBe(210.375);
      expect(seed.corner.x).toBeGreaterThanOrEqual(0);
      expect(seed.corner.x).toBeLessThanOrEqual(map.width);
      expect(seed.corner.y).toBeGreaterThanOrEqual(0);
      expect(seed.corner.y).toBeLessThanOrEqual(map.height);
    }
  });

  it("repositions A by translating both anchors with spacing and edge clamping", () => {
    const result = place(select("A"), { x: 1200, y: -500 });
    expect(result.placement.stage).toBe("placed");
    expect("sample" in result.placement && result.placement.sample).toMatchObject({
      anchor: { x: 789.625, y: 0 }, corner: { x: 1000, y: 210.375 },
    });
    expect(result.grid?.cellSize).toBe(70.125);
  });

  it("switches selection, fixes A when repositioning B, and clears selection on commit", () => {
    const selectedA = select("A");
    const selectedB = transitionPlacement(selectedA, { type: "select", anchor: "B" }, 3, DEFAULT_GRID, map).placement;
    const result = place(selectedB, { x: a.x - 225.75, y: a.y + 100 });
    expect(result.placement.stage).toBe("placed");
    expect("sample" in result.placement && result.placement.sample.anchor).toEqual(a);
    expect(result.grid?.cellSize).toBe(75.25);
    expect(place(selectedB, a)).toEqual({ placement: selectedB, invalid: true });
  });

  it("reinterprets the same sample bounds on count changes and rejects an invalid count", () => {
    const result = transitionPlacement(placed, { type: "count", count: 5 }, 3, DEFAULT_GRID, map);
    expect(result.grid?.cellSize).toBe(42.075);
    expect("sample" in placed && "sample" in result.placement && result.placement.sample.corner).toEqual("sample" in placed && placed.sample.corner);
    const tiny = place(place(EMPTY_PLACEMENT, { x: 0, y: 0 }, 1).placement, { x: 0.1, y: 0.1 }, 1).placement;
    expect(transitionPlacement(tiny, { type: "count", count: 5 }, 1, DEFAULT_GRID, map)).toEqual({ placement: tiny, invalid: true });
  });

  it("adjusts A by image pixels and B by side length along either axis", () => {
    const moved = transitionPlacement(select("A"), { type: "adjust", anchor: "A", delta: { x: 10, y: 0 } }, 3, DEFAULT_GRID, map);
    expect(moved.placement.stage).toBe("repositioning");
    expect(moved.grid?.cellSize).toBe(70.125);
    expect(moved.grid?.offsetX).toBe(14.75);
    const resized = transitionPlacement(select("B"), { type: "adjust", anchor: "B", delta: { x: 0, y: -1 } }, 3, DEFAULT_GRID, map);
    expect(resized.grid?.cellSize).toBe(209.375 / 3);
    expect("sample" in resized.placement && resized.placement.sample.anchor).toEqual(a);
  });

  it("clears placement and selection without emitting a replacement draft", () => {
    expect(transitionPlacement(select("B"), { type: "reset" }, 3, DEFAULT_GRID, map)).toEqual({ placement: EMPTY_PLACEMENT });
  });

  it("commits snapped B placement and resizing, and accepts a freeform override", () => {
    const snapped = transitionPlacement(pending, { type: "place", point: b, cellSizeStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(snapped.grid?.cellSize).toBe(70);
    const selected = transitionPlacement(snapped.placement, { type: "select", anchor: "B" }, 3, DEFAULT_GRID, map).placement;
    expect(transitionPlacement(selected, { type: "place", point: b, cellSizeStep: 0 }, 3, DEFAULT_GRID, map).grid?.cellSize).toBe(70.125);
    expect(transitionPlacement(selected, { type: "place", point: { x: a.x + 211, y: a.y + 100 }, cellSizeStep: 0.5 }, 3, DEFAULT_GRID, map).grid?.cellSize).toBe(70.5);
  });

  it("retains A and the valid draft when a snapped candidate becomes empty", () => {
    const result = transitionPlacement(pending, { type: "place", point: { x: a.x + 0.2, y: a.y + 0.2 }, cellSizeStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(result).toEqual({ placement: pending, invalid: true });
  });

  it("snaps pending A and commits half-pixel offsets with B", () => {
    const first = transitionPlacement(EMPTY_PLACEMENT, { type: "place", point: a, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(first).toEqual({ placement: { stage: "awaiting-b", anchor: { x: 425.5, y: 316 } } });
    const second = transitionPlacement(first.placement, { type: "place", point: b, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(second.grid).toMatchObject({ cellSize: 70, offsetX: 5.5, offsetY: 36 });
  });

  it("snaps A repositioning while preserving existing fractional spacing", () => {
    const result = transitionPlacement(select("A"), { type: "place", point: { x: 435.73, y: 335.2 }, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(result.grid).toMatchObject({ cellSize: 70.125, offsetX: 15, offsetY: 54.5 });
    expect("sample" in result.placement && result.placement.sample.anchor).toEqual({ x: 435.75, y: 335 });
  });

  it("aligns a resized freeform sample with the snapped offsets", () => {
    const result = transitionPlacement(select("B"), { type: "place", point: b, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(result.grid).toMatchObject({ cellSize: 70, offsetX: 5.5, offsetY: 36 });
    expect("sample" in result.placement && result.placement.sample.anchor).toEqual({ x: 425.5, y: 316 });
  });

  it("allows Shift-equivalent freeform offsets for repositioning and keyboard adjustment", () => {
    const result = transitionPlacement(select("A"), { type: "place", point: { x: 435.73, y: 335.2 }, offsetStep: 0 }, 3, DEFAULT_GRID, map);
    expect(result.grid?.offsetX).toBeCloseTo(14.98);
    expect(result.grid?.offsetY).toBeCloseTo(54.7);
    const normal = transitionPlacement(select("A"), { type: "adjust", anchor: "A", delta: { x: 1, y: 0 }, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(normal.grid).toMatchObject({ offsetX: 6, offsetY: 35.5 });
    const free = transitionPlacement(select("A"), { type: "adjust", anchor: "A", delta: { x: 10, y: 0 }, offsetStep: 0 }, 3, DEFAULT_GRID, map);
    expect(free.grid).toMatchObject({ offsetX: 14.75, offsetY: 35.25 });
  });
});

describe("keyboard resizing and confirmation", () => {
  const snappedA = { x: 425.5, y: 316 };
  const arrows = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }];

  it.each([1, 3, 5] as const)("resizes each cell by half a pixel for a %s-square sample in every arrow direction", (count) => {
    const sample = drawGridSample(snappedA, { x: snappedA.x + 70.5 * count, y: snappedA.y + 70.5 * count }, count, map)!;
    for (const delta of arrows) {
      const editing: Placement = { stage: "repositioning", selected: "B", sample };
      const result = transitionPlacement(editing, { type: "adjust", anchor: "B", delta, cellSizeStep: 0.5, offsetStep: 0.5 }, count, DEFAULT_GRID, map);
      const expected = 70.5 + (delta.x || delta.y) * 0.5;
      expect(result.grid?.cellSize).toBe(expected);
      expect("sample" in result.placement && result.placement.sample.anchor).toEqual(snappedA);
      expect((snappedA.x - result.grid!.offsetX) / expected).toBeCloseTo(Math.floor(snappedA.x / expected));
      expect((snappedA.y - result.grid!.offsetY) / expected).toBeCloseTo(Math.floor(snappedA.y / expected));
      expect(result.grid!.offsetX * 2 % 1).toBe(0);
      expect(result.grid!.offsetY * 2 % 1).toBe(0);
    }
  });

  it.each([[1, 1], [-1, 1], [1, -1], [-1, -1]])("retains quadrant %s,%s while keyboard resizing", (sx, sy) => {
    const sample = drawGridSample({ x: 500, y: 400 }, { x: 500 + sx * 150, y: 400 + sy * 150 }, 3, map)!;
    for (const delta of arrows) {
      const result = transitionPlacement({ stage: "repositioning", selected: "B", sample },
        { type: "adjust", anchor: "B", delta, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
      expect(result.grid!.cellSize).toBe(50 + (delta.x ? delta.x * sx : delta.y * sy) * 0.5);
      const next = "sample" in result.placement && result.placement.sample;
      expect(next && Math.sign(next.corner.x - next.anchor.x)).toBe(sx);
      expect(next && Math.sign(next.corner.y - next.anchor.y)).toBe(sy);
    }
  });

  it.each([1, -1])("moves a fractional cell to the adjacent half-pixel step in direction %s", (direction) => {
    const sample = drawGridSample({ x: 500, y: 400 }, { x: 710.375, y: 610.375 }, 3, map)!;
    const editing: Placement = { stage: "repositioning", selected: "B", sample };
    const result = transitionPlacement(editing, { type: "adjust", anchor: "B", delta: { x: direction, y: 0 }, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(result.grid!.cellSize).toBe(direction > 0 ? 70.5 : 70);
  });

  it("clamps growth to a fitting half-pixel side at the map edge and rejects a zero-size shrink", () => {
    const sample = drawGridSample({ x: 0, y: 0 }, { x: 799.5, y: 799.5 }, 3, map)!;
    const editing: Placement = { stage: "repositioning", selected: "B", sample };
    const edge = transitionPlacement(editing, { type: "adjust", anchor: "B", delta: { x: 1, y: 0 }, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map);
    expect(edge.grid!.cellSize).toBe(266.5);
    expect("sample" in edge.placement && edge.placement.sample.corner).toEqual({ x: 799.5, y: 799.5 });
    const tiny: Placement = { stage: "repositioning", selected: "B", sample: drawGridSample({ x: 0, y: 0 }, { x: 1.5, y: 1.5 }, 3, map)! };
    expect(transitionPlacement(tiny, { type: "adjust", anchor: "B", delta: { x: -1, y: 0 }, cellSizeStep: 0.5, offsetStep: 0.5 }, 3, DEFAULT_GRID, map)).toEqual({ placement: tiny, invalid: true });
  });

  it.each(["A", "B"] as const)("confirms %s without changing geometry, resnapping fractions or emitting another draft", (anchor) => {
    const editing = select(anchor);
    const resized = transitionPlacement(editing, { type: "adjust", anchor, delta: { x: 10, y: 0 }, cellSizeStep: 0, offsetStep: 0 }, 3, DEFAULT_GRID, map);
    const result = transitionPlacement(resized.placement, { type: "confirm" }, 3, DEFAULT_GRID, map);
    expect(result).toEqual({ placement: { stage: "placed", sample: "sample" in resized.placement && resized.placement.sample } });
    expect(result.grid).toBeUndefined();
  });

  it("leaves unselected and incomplete placements unchanged on confirmation", () => {
    for (const state of [EMPTY_PLACEMENT, pending, placed]) {
      expect(transitionPlacement(state, { type: "confirm" }, 3, DEFAULT_GRID, map)).toEqual({ placement: state });
    }
  });
});

describe("qualified clicks and navigation", () => {
  it.each([0, 5.99, CLICK_MOVEMENT_LIMIT])("qualifies movement of %s CSS pixels", (movement) => {
    const gesture = movePointerGesture(beginPointerGesture(EMPTY_GESTURE, press(), false), 1, { x: 10 + movement, y: 20 });
    expect(finishPointerGesture(gesture, 1).click?.id).toBe(1);
  });

  it("uses Euclidean movement and suppresses a swipe even after returning to its start", () => {
    let gesture = movePointerGesture(beginPointerGesture(EMPTY_GESTURE, press(), false), 1, { x: 15, y: 25 });
    expect(gesture.navigating).toBe(true);
    gesture = movePointerGesture(gesture, 1, press().start);
    expect(finishPointerGesture(gesture, 1).click).toBeNull();
  });

  it("pan mode, Space and middle-button presses cannot place anchors", () => {
    expect(finishPointerGesture(beginPointerGesture(EMPTY_GESTURE, press(), true), 1).click).toBeNull();
  });

  it("recovers after an interruption without changing pending or completed placement", () => {
    const initial = beginPointerGesture(EMPTY_GESTURE, press(), false);
    expect(finishPointerGesture(initial, 1, true).click).toBeNull();
    const interrupted = interruptPointerGesture(initial);
    expect(interrupted.interrupted).toBe(true);
    expect(finishPointerGesture(interrupted, 1).click).toBeNull();
    const released = finishPointerGesture(interrupted, 1).gesture;
    const resumed = finishPointerGesture(beginPointerGesture(released, press(2), false), 2);
    expect(resumed.click?.id).toBe(2);
    expect(place(pending, b).grid?.cellSize).toBe(70.125);
    expect(placed.stage).toBe("placed");
  });

  it("keeps all remaining touches suppressed after navigation is interrupted", () => {
    const pair = beginPointerGesture(beginPointerGesture(EMPTY_GESTURE, press(1, "touch"), false), press(2, "touch"), false);
    const interrupted = interruptPointerGesture(pair);
    const first = finishPointerGesture(interrupted, 1);
    const third = beginPointerGesture(first.gesture, press(3, "touch"), false);
    const releaseThird = finishPointerGesture(third, 3);
    expect(releaseThird.click).toBeNull();
    const releaseLast = finishPointerGesture(releaseThird.gesture, 2);
    expect(releaseLast.click).toBeNull();
    expect(releaseLast.gesture).toEqual(EMPTY_GESTURE);
  });

  it("suppresses all touch releases until every finger lifts, then permits a new tap", () => {
    let gesture = beginPointerGesture(EMPTY_GESTURE, press(1, "touch"), false);
    gesture = beginPointerGesture(gesture, press(2, "touch"), false);
    const first = finishPointerGesture(gesture, 2);
    expect(first.click).toBeNull();
    expect(first.gesture.multiTouch).toBe(true);
    const last = finishPointerGesture(first.gesture, 1);
    expect(last.click).toBeNull();
    expect(last.gesture).toEqual(EMPTY_GESTURE);
    expect(finishPointerGesture(beginPointerGesture(last.gesture, press(3, "touch"), false), 3).click?.id).toBe(3);
  });

  it("cancelling one touch prevents the remaining finger from becoming a click", () => {
    const pair = beginPointerGesture(beginPointerGesture(EMPTY_GESTURE, press(1, "touch"), false), press(2, "touch"), false);
    const cancelled = finishPointerGesture(pair, 2, true);
    expect(finishPointerGesture(cancelled.gesture, 1).click).toBeNull();
  });
});
