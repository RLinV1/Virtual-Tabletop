import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec, type Point } from "@vtt/shared";
import { areaOrigin, areaShape, areaSizeFromDrag, hitMark, measure, snapToCellCenter, snapToIntersection, sweepPoints, type Mark } from "../src/board/tools";

const grid: GridSpec = DEFAULT_GRID; // 70 px cells, 5 ft per cell
const offsetGrid: GridSpec = { ...DEFAULT_GRID, offsetX: 10, offsetY: 20 };
const cell = (col: number, row: number): Point => ({ x: col * 70 + 35, y: row * 70 + 35 });

describe("board tools (KAN-69, FR-TAC-03/04/06)", () => {
  describe("snapping", () => {
    it("snaps to the centre of the containing cell, honouring the grid offset", () => {
      expect(snapToCellCenter({ x: 12, y: 60 }, grid)).toEqual({ x: 35, y: 35 });
      expect(snapToCellCenter({ x: 12, y: 60 }, offsetGrid)).toEqual({ x: 45, y: 55 });
    });

    it("snaps to the nearest intersection, honouring the grid offset", () => {
      expect(snapToIntersection({ x: 100, y: 30 }, grid)).toEqual({ x: 70, y: 0 });
      expect(snapToIntersection({ x: 100, y: 30 }, offsetGrid)).toEqual({ x: 80, y: 20 });
    });
  });

  describe("measure", () => {
    it("counts five cells in a straight line as 25 ft", () => {
      expect(measure(cell(1, 1), cell(6, 1), grid, false).label).toBe("25 ft");
    });

    it("counts each diagonal step as one cell", () => {
      expect(measure(cell(0, 0), cell(3, 3), grid, false).label).toBe("15 ft");
    });

    it("snaps both ends to cell centres", () => {
      const m = measure({ x: 5, y: 5 }, { x: 360, y: 60 }, grid, false);
      expect(m.from).toEqual({ x: 35, y: 35 });
      expect(m.to).toEqual({ x: 385, y: 35 });
    });

    it("measures freely with Alt, to one decimal place", () => {
      const m = measure({ x: 3, y: 7 }, { x: 3 + 105, y: 7 }, grid, true);
      expect(m.from).toEqual({ x: 3, y: 7 });
      expect(m.label).toBe("7.5 ft");
    });

    it("uses the grid's own unit label and scale", () => {
      const metres: GridSpec = { ...grid, unitsPerCell: 1.5, unitLabel: "m" };
      expect(measure(cell(0, 0), cell(2, 0), metres, false).label).toBe("3 m");
    });
  });

  describe("area shapes", () => {
    const origin = { x: 140, y: 140 };

    it("sizes a circle's radius from its size in grid units", () => {
      expect(areaShape("circle", origin, origin, 20, grid)).toEqual({ kind: "circle", center: origin, radius: 280 });
    });

    it("builds a cone as long as its size and as wide at its far end", () => {
      const shape = areaShape("cone", origin, { x: 500, y: 140 }, 15, grid);
      if (shape.kind !== "polygon") throw new Error("expected a polygon");
      const [apex, left, right] = shape.points;
      expect(apex).toEqual(origin);
      expect(left!.x).toBeCloseTo(140 + 210);
      expect(right!.x).toBeCloseTo(140 + 210);
      expect(Math.abs(right!.y - left!.y)).toBeCloseTo(210);
    });

    it("points a cone toward the aim", () => {
      const shape = areaShape("cone", origin, { x: 140, y: 0 }, 10, grid);
      if (shape.kind !== "polygon") throw new Error("expected a polygon");
      const [, left, right] = shape.points;
      expect((left!.y + right!.y) / 2).toBeCloseTo(0);
      expect((left!.x + right!.x) / 2).toBeCloseTo(140);
    });

    it("starts a box at the origin and extends it toward the aim, its size as the side", () => {
      const shape = areaShape("box", origin, { x: 400, y: 140 }, 10, grid);
      if (shape.kind !== "polygon") throw new Error("expected a polygon");
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(140);
      expect(Math.max(...xs)).toBeCloseTo(280);
      expect(Math.min(...ys)).toBeCloseTo(70);
      expect(Math.max(...ys)).toBeCloseTo(210);
    });

    it("turns a box to face the aim", () => {
      const shape = areaShape("box", origin, { x: 240, y: 240 }, 10, grid);
      if (shape.kind !== "polygon") throw new Error("expected a polygon");
      const [a, b] = shape.points;
      expect(Math.hypot(b!.x - a!.x, b!.y - a!.y)).toBeCloseTo(140);
      expect(b!.x - a!.x).toBeCloseTo(b!.y - a!.y);
    });

    it("points right when there is no aim", () => {
      const shape = areaShape("cone", origin, origin, 10, grid);
      if (shape.kind !== "polygon") throw new Error("expected a polygon");
      expect(shape.points[1]!.x).toBeCloseTo(280);
    });

    it("snaps the origin to an intersection unless placed freely", () => {
      expect(areaOrigin({ x: 150, y: 125 }, grid, false)).toEqual({ x: 140, y: 140 });
      expect(areaOrigin({ x: 150, y: 125 }, grid, true)).toEqual({ x: 150, y: 125 });
    });
  });

  describe("sizing an area by dragging", () => {
    const origin = { x: 140, y: 140 };

    it("uses the drag length, snapped to whole cells", () => {
      expect(areaSizeFromDrag(origin, { x: 140 + 3.3 * 70, y: 140 }, grid, false)).toBe(15);
      expect(areaSizeFromDrag(origin, { x: 140 + 3 * 70, y: 140 + 3 * 70 }, grid, false)).toBe(20);
    });

    it("is at least one cell", () => {
      expect(areaSizeFromDrag(origin, { x: 150, y: 140 }, grid, false)).toBe(5);
    });

    it("uses the exact length when placed freely", () => {
      expect(areaSizeFromDrag(origin, { x: 140 + 105, y: 140 }, grid, true)).toBe(7.5);
    });
  });

  describe("eraser hit testing", () => {
    const line: Mark = { kind: "draw", shape: "line", color: 0, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const rect: Mark = { kind: "draw", shape: "rect", color: 0, from: { x: 200, y: 200 }, to: { x: 300, y: 260 } };
    const circle: Mark = { kind: "draw", shape: "circle", color: 0, from: { x: 500, y: 500 }, to: { x: 540, y: 500 } };
    const cone: Mark = { kind: "area", shape: "cone", size: 15, origin: { x: 140, y: 140 }, toward: { x: 500, y: 140 }, free: false };
    const ruler: Mark = { kind: "measure", from: cell(0, 0), to: cell(4, 0), free: false };

    it("hits a line only near it", () => {
      expect(hitMark(line, { x: 50, y: 5 }, 8, grid)).toBe(true);
      expect(hitMark(line, { x: 50, y: 20 }, 8, grid)).toBe(false);
      expect(hitMark(line, { x: 120, y: 0 }, 8, grid)).toBe(false);
    });

    it("hits a rectangle or circle on or inside it", () => {
      expect(hitMark(rect, { x: 250, y: 230 }, 8, grid)).toBe(true);
      expect(hitMark(rect, { x: 320, y: 230 }, 8, grid)).toBe(false);
      expect(hitMark(circle, { x: 510, y: 510 }, 8, grid)).toBe(true);
      expect(hitMark(circle, { x: 560, y: 500 }, 8, grid)).toBe(false);
    });

    it("hits an area inside its outline", () => {
      expect(hitMark(cone, { x: 300, y: 140 }, 8, grid)).toBe(true);
      expect(hitMark(cone, { x: 150, y: 250 }, 8, grid)).toBe(false);
    });

    it("hits a brush stroke near any of its segments", () => {
      const stroke: Mark = { kind: "stroke", color: 0, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }] };
      expect(hitMark(stroke, { x: 75, y: 27 }, 8, grid)).toBe(true);
      expect(hitMark(stroke, { x: 50, y: 10 }, 8, grid)).toBe(false);
    });

    it("hits a measurement along its snapped line", () => {
      expect(hitMark(ruler, { x: 150, y: 38 }, 8, grid)).toBe(true);
      expect(hitMark(ruler, { x: 150, y: 80 }, 8, grid)).toBe(false);
    });
  });

  describe("eraser sweep", () => {
    it("samples the whole path at most one reach apart, both ends included", () => {
      const pts = sweepPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 12);
      expect(pts[0]).toEqual({ x: 0, y: 0 });
      expect(pts.at(-1)).toEqual({ x: 100, y: 0 });
      for (let i = 1; i < pts.length; i++) expect(pts[i]!.x - pts[i - 1]!.x).toBeLessThanOrEqual(12);
    });

    it("catches a thin line crossed between two far-apart pointer positions", () => {
      const line: Mark = { kind: "draw", shape: "line", color: 0, from: { x: 50, y: -100 }, to: { x: 50, y: 100 } };
      const from = { x: 0, y: 0 };
      const to = { x: 100, y: 0 };
      expect(hitMark(line, from, 12, grid) || hitMark(line, to, 12, grid)).toBe(false);
      expect(sweepPoints(from, to, 12).some((p) => hitMark(line, p, 12, grid))).toBe(true);
    });

    it("is a single point for a click", () => {
      expect(sweepPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 12)).toEqual([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
    });
  });
});
