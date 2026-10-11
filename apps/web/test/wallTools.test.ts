import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type Wall } from "@vtt/shared";
import { closestOnSegment, wallAt, wallPoint } from "../src/board/tools";

const walls: Record<string, Wall> = {
  top: { id: "top", a: { x: 0, y: 0 }, b: { x: 140, y: 0 } },
  side: { id: "side", a: { x: 140, y: 0 }, b: { x: 140, y: 140 } },
};

describe("Walls tool geometry (FR-GM-09, wall-editing)", () => {
  it("finds the nearest point on a segment, clamped to its ends", () => {
    expect(closestOnSegment({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 50, y: 0 });
    expect(closestOnSegment({ x: 150, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(closestOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("picks the wall under a click within the tolerance, the nearest one first", () => {
    expect(wallAt(walls, { x: 70, y: 4 }, 10)?.id).toBe("top");
    expect(wallAt(walls, { x: 137, y: 70 }, 10)?.id).toBe("side");
    expect(wallAt(walls, { x: 70, y: 40 }, 10)).toBeNull();
  });

  it("snaps a drawn end to a wall end nearby, else to a grid corner, unless placed freely", () => {
    expect(wallPoint({ x: 135, y: 6 }, walls, DEFAULT_GRID, 12, false)).toEqual({ x: 140, y: 0 });
    expect(wallPoint({ x: 205, y: 66 }, walls, DEFAULT_GRID, 12, false)).toEqual({ x: 210, y: 70 });
    expect(wallPoint({ x: 205, y: 66 }, walls, DEFAULT_GRID, 12, true)).toEqual({ x: 205, y: 66 });
  });
});
