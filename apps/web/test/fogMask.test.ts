import { describe, expect, it } from "vitest";
import { fogMaskAlpha } from "../src/board/fogTexture";

describe("fog mask feather (fog-and-filter-polish, FR-GM-17)", () => {
  it("is fully opaque inside a region whatever the noise", () => {
    for (const n of [0, 0.3, 0.5, 1]) expect(fogMaskAlpha(1, n)).toBe(1);
  });

  it("fades to nothing well outside the region", () => {
    expect(fogMaskAlpha(0, 0.5)).toBeLessThan(0.1);
  });

  it("falls steadily with distance, so the edge has no step", () => {
    let last = 1;
    for (let r = 1; r >= 0; r -= 0.05) {
      const a = fogMaskAlpha(r, 0.5);
      expect(a).toBeLessThanOrEqual(last + 1e-9);
      expect(last - a).toBeLessThan(0.2);
      last = a;
    }
  });

  it("lets noise vary the outer mist but barely moves the edge", () => {
    expect(Math.abs(fogMaskAlpha(0.95, 0) - fogMaskAlpha(0.95, 1))).toBeLessThan(0.1);
    expect(fogMaskAlpha(0.4, 1)).toBeGreaterThan(fogMaskAlpha(0.4, 0));
  });
});
