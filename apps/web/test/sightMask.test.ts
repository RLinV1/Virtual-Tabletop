import { describe, expect, it } from "vitest";
import { isBorderEdge, sightColor } from "../src/board/sightMask";

describe("sight mask helpers (line-of-sight, FR-GM-19)", () => {
  it("detects edges lying along the map border only", () => {
    expect(isBorderEdge({ x: 0, y: 10 }, { x: 0, y: 90 }, 100, 100)).toBe(true);
    expect(isBorderEdge({ x: 10, y: 100 }, { x: 90, y: 99.5 }, 100, 100)).toBe(true);
    expect(isBorderEdge({ x: 0, y: 10 }, { x: 50, y: 50 }, 100, 100)).toBe(false);
    expect(isBorderEdge({ x: 0, y: 0 }, { x: 100, y: 100 }, 100, 100)).toBe(false);
  });

  it("tints the darkness to the map, near-black but never pure black", () => {
    const [r, g, b] = sightColor([40, 120, 50]);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThan(40);
    expect(sightColor(null).some((c) => c > 0)).toBe(true);
    expect(sightColor([0, 0, 0]).every((c) => c > 0)).toBe(true);
  });
});
