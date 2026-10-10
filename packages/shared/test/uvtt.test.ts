import { describe, expect, it } from "vitest";
import { Command, DEFAULT_GRID, UvttError, normalizeUvtt, parseUvtt, serializeUvtt, positiveModulo, validateUvttDraft } from "../src";

const map = { width: 400, height: 300 };
const raw = () => ({ format: 0.3, resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 4, y: 3 }, pixels_per_grid: 100 }, image: "aGVsbG8=",
  line_of_sight: [[{ x: 0, y: 1 }, { x: 4, y: 1 }]], objects_line_of_sight: [[{ x: 1, y: 2 }, { x: 3, y: 2 }]],
  portals: [{ bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }], position: { x: 3.2, y: 0.4 }, rotation: 1.25, closed: false, freestanding: true }],
});

describe("UVTT parsing and coordinates (KAN-44, FR-GM-06/07/12)", () => {
  it.each([0.2, 0.3, 1])("accepts flat format %s and missing optional arrays", (format) => {
    const { line_of_sight: _l, objects_line_of_sight: _o, portals: _p, ...minimal } = raw();
    expect(normalizeUvtt(parseUvtt({ ...minimal, format }), map, DEFAULT_GRID).walls).toEqual([]);
  });
  it("preserves supplied metadata independently of bounds and removes duplicate solid overlap", () => {
    const result = normalizeUvtt(parseUvtt(raw()), map, DEFAULT_GRID);
    expect(result.walls).toHaveLength(4);
    expect(result.walls.filter((w) => !w.portal && w.source === "line_of_sight")).toEqual([
      { a: { x: 0, y: 100 }, b: { x: 100, y: 100 }, source: "line_of_sight" },
      { a: { x: 200, y: 100 }, b: { x: 400, y: 100 }, source: "line_of_sight" },
    ]);
    expect(result.walls.at(-1)?.portal).toEqual({ position: { x: 320, y: 40 }, rotation: 1.25, closed: false, freestanding: true });
  });
  it("does not implicitly close polylines", () => {
    const f = { ...raw(), portals: [], objects_line_of_sight: [], line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]] };
    expect(normalizeUvtt(parseUvtt(f), map, DEFAULT_GRID).walls).toHaveLength(2);
  });
  it("warns about nested extension data without assigning unknown portal identity", () => {
    const f = raw();
    const result = normalizeUvtt(parseUvtt({ ...f, lights: [], resolution: { ...f.resolution, extension: "private" }, portals: [{ ...f.portals[0], door: "private" }] }), map, DEFAULT_GRID);
    expect(result.diagnostics.map((issue) => issue.path)).toEqual(["lights", "resolution.extension", "portals[0].door"]);
    expect(result.walls.at(-1)?.portal).toEqual(f.portals[0] && { position: { x: 320, y: 40 }, rotation: 1.25, closed: false, freestanding: true });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("clips crop crossings, removes off-crop lines and reports bounded diagnostics", () => {
    const f = { ...raw(), portals: [], objects_line_of_sight: [], line_of_sight: Array.from({ length: 30 }, () => [{ x: -1, y: 1 }, { x: 5, y: 1 }]) };
    const result = normalizeUvtt(parseUvtt(f), map, DEFAULT_GRID);
    expect(result.walls[0]).toEqual({ a: { x: 0, y: 100 }, b: { x: 400, y: 100 }, source: "line_of_sight" });
    expect(result.diagnostics).toHaveLength(20);
  });
  it.each([{ x: 0.25, y: 1.4 }, { x: -0.3, y: -2.8 }])("round trips phase for origin %j with subpixel geometry", (origin) => {
    const f = raw(); f.resolution.map_origin = origin;
    const first = normalizeUvtt(parseUvtt(f), map, DEFAULT_GRID);
    expect(first.grid.offsetX).toBeCloseTo(positiveModulo(-origin.x * 100, 100), 10);
    const output = serializeUvtt(map, first.grid, first.walls, f.image);
    const second = normalizeUvtt(parseUvtt(output), map, DEFAULT_GRID);
    expect(second.grid.cellSize).toBe(first.grid.cellSize);
    expect(second.grid.offsetX).toBeCloseTo(first.grid.offsetX, 6);
    expect(second.grid.offsetY).toBeCloseTo(first.grid.offsetY, 6);
    expect(second.walls).toHaveLength(first.walls.length);
    for (const [i, w] of first.walls.entries()) {
      for (const end of ["a", "b"] as const) for (const axis of ["x", "y"] as const) expect(second.walls[i]![end][axis]).toBeCloseTo(w[end][axis], 6);
      if (w.portal?.position) {
        expect(second.walls[i]?.portal?.position?.x).toBeCloseTo(w.portal.position.x, 6);
        expect(second.walls[i]?.portal?.position?.y).toBeCloseTo(w.portal.position.y, 6);
      }
    }
  });
  it.each([
    { ...raw(), format: 2 }, { ...raw(), resolution: undefined }, { ...raw(), image: undefined },
    { ...raw(), portals: [{ bounds: [{ x: 1, y: 1 }] }] },
    { ...raw(), portals: [{ bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }], closed: "yes" }] },
    { ...raw(), line_of_sight: [[{ x: Infinity, y: 0 }, { x: 1, y: 0 }]] },
  ])("rejects malformed supported data without echoing input", (file) => {
    expect(() => parseUvtt(file)).toThrow(UvttError);
  });
  it("rejects zero-length and excessive normalized geometry, never truncating", () => {
    expect(() => normalizeUvtt(parseUvtt({ ...raw(), line_of_sight: [[{ x: 1, y: 1 }, { x: 1, y: 1 }]] }), map, DEFAULT_GRID)).toThrow(/different endpoints/);
    expect(() => normalizeUvtt(parseUvtt({ ...raw(), portals: [], line_of_sight: Array.from({ length: 1501 }, () => [{ x: 0, y: 0 }, { x: 1, y: 0 }]) }), map, DEFAULT_GRID)).toThrow(/1500/);
  });
  it("rejects fractional export spacing and invalid edited geometry", () => {
    expect(() => serializeUvtt(map, { ...DEFAULT_GRID, cellSize: 70.5 }, [], "")).toThrow(/integer/);
    expect(() => validateUvttDraft(DEFAULT_GRID, [{ a: { x: -1, y: 0 }, b: { x: 2, y: 0 } }], map)).toThrow(/image/);
  });
  it("keeps the apply command small and excludes supplied geometry", () => {
    expect(Command.safeParse({ type: "scene.importUVTT", importId: "id", revision: 1 }).success).toBe(true);
    expect(Command.safeParse({ type: "scene.importUVTT", importId: "id", revision: 1, image: "secret" }).success).toBe(false);
  });
});
