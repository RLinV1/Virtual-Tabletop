import { describe, expect, it } from "vitest";
import { PAN_THRESHOLD_PX, exceedsPanThreshold, pinchIsManual, resizeAction, zoomChangesScale } from "../src/board/viewFit";

const portrait = { width: 390, height: 700 };
const landscape = { width: 844, height: 300 };

describe("what counts as a manual pan (FR-TAC-01, KAN-54)", () => {
  const start = { x: 100, y: 100 };

  it("treats a press that never moved as not manual", () => {
    expect(exceedsPanThreshold(start, start)).toBe(false);
  });

  it("treats touch jitter below the threshold as not manual", () => {
    expect(exceedsPanThreshold(start, { x: 101, y: 102 })).toBe(false);
    expect(exceedsPanThreshold(start, { x: 100 + PAN_THRESHOLD_PX - 0.5, y: 100 })).toBe(false);
  });

  it("treats movement past the threshold in any direction as manual", () => {
    expect(exceedsPanThreshold(start, { x: 100 + PAN_THRESHOLD_PX, y: 100 })).toBe(true);
    expect(exceedsPanThreshold(start, { x: 100, y: 80 })).toBe(true);
    expect(exceedsPanThreshold(start, { x: 103, y: 103 })).toBe(true);
  });
});

describe("what a canvas resize does to the camera (FR-TAC-01, KAN-54)", () => {
  it("refits an automatic camera when the size changed", () => {
    expect(resizeAction(true, portrait, landscape)).toBe("refit");
  });

  it("recenters a manual camera when the size changed", () => {
    expect(resizeAction(false, portrait, landscape)).toBe("recenter");
  });

  it("does nothing when the size is unchanged", () => {
    expect(resizeAction(true, portrait, { ...portrait })).toBe("none");
    expect(resizeAction(false, portrait, { ...portrait })).toBe("none");
  });

  it("does nothing for an empty size", () => {
    expect(resizeAction(true, portrait, { width: 0, height: 300 })).toBe("none");
    expect(resizeAction(false, portrait, { width: 300, height: 0 })).toBe("none");
  });
});

describe("what counts as a manual zoom (FR-TAC-01, KAN-54)", () => {
  it("is a change when the clamped scale moved", () => {
    expect(zoomChangesScale(1, 1.1)).toBe(true);
    expect(zoomChangesScale(1, 0.9)).toBe(true);
  });

  it("is not a change when the scale clamps to the same value", () => {
    expect(zoomChangesScale(8, 8)).toBe(false);
    expect(zoomChangesScale(0.1, 0.1 + 1e-12)).toBe(false);
  });
});

describe("what counts as a manual two-finger gesture (FR-TAC-01, KAN-54)", () => {
  const start = { x: 200, y: 300 };

  it("treats a two-finger pan at constant spread as manual, so a later resize keeps the camera", () => {
    // Same finger distance, so the scale is unchanged, but the midpoint moved past the threshold.
    const autoFit = !pinchIsManual(start, { x: 200 + PAN_THRESHOLD_PX + 6, y: 300 }, 1.5, 1.5);
    expect(autoFit).toBe(false);
    expect(resizeAction(autoFit, portrait, landscape)).toBe("recenter");
  });

  it("treats a zoom as manual even when the midpoint stayed put", () => {
    expect(pinchIsManual(start, start, 1, 1.2)).toBe(true);
  });

  it("treats two resting fingers with jitter as not manual", () => {
    expect(pinchIsManual(start, { x: 201, y: 301 }, 1.5, 1.5)).toBe(false);
  });
});
