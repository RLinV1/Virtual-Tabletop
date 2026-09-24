import { describe, expect, it } from "vitest";
import { recenterOnResize } from "../src/board/recenter";

/** The world point under the viewport centre, for a given world position and zoom. */
const centreWorldPoint = (pos: { x: number; y: number }, size: { width: number; height: number }, scale: number) => ({
  x: (size.width / 2 - pos.x) / scale,
  y: (size.height / 2 - pos.y) / scale,
});

describe("board view is undisturbed by layout changes (room-sidebar-layout)", () => {
  it.each([0.5, 1, 2.5])("keeps the centred map point when the sidebar collapses (zoom %s)", (scale) => {
    const pos = { x: -340, y: 120 };
    const expanded = { width: 1100, height: 800 };
    const collapsed = { width: 1420, height: 800 };
    const before = centreWorldPoint(pos, expanded, scale);
    const after = centreWorldPoint(recenterOnResize(pos, expanded, collapsed), collapsed, scale);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("round-trips when the sidebar expands again", () => {
    const pos = { x: 10, y: 20 };
    const a = { width: 1100, height: 800 };
    const b = { width: 1420, height: 760 };
    expect(recenterOnResize(recenterOnResize(pos, a, b), b, a)).toEqual(pos);
  });
});
