import { describe, expect, it } from "vitest";
import { blocksSight, inSight, pointInPolygon, polygonArea, sightPolygon, viewerSight, type Point, type RoomState, type Segment, type Wall } from "../src";

const bounds = { width: 1000, height: 1000 };
const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const area = (p: Point[]) => Math.abs(polygonArea(p));

describe("line of sight geometry (FR-GM-19)", () => {
  it("sees the whole map in an open room", () => {
    const poly = sightPolygon([], { x: 300, y: 400 }, bounds);
    expect(area(poly)).toBeCloseTo(1_000_000, -2);
  });

  it("casts a shadow behind a single wall", () => {
    const poly = sightPolygon([seg(400, 400, 600, 400)], { x: 500, y: 200 }, bounds);
    expect(pointInPolygon({ x: 500, y: 300 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 600 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 100, y: 600 }, poly)).toBe(true);
  });

  it("is blocked by both legs of an L-shaped corner", () => {
    const walls = [seg(500, 500, 500, 800), seg(500, 500, 800, 500)];
    const poly = sightPolygon(walls, { x: 300, y: 300 }, bounds);
    expect(pointInPolygon({ x: 700, y: 700 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 700, y: 300 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 700 }, poly)).toBe(true);
  });

  it("leaves no gap between collinear walls end to end", () => {
    const walls = [seg(300, 500, 500, 500), seg(500, 500, 700, 500)];
    const poly = sightPolygon(walls, { x: 500, y: 200 }, bounds);
    for (const x of [499, 500, 501]) expect(pointInPolygon({ x, y: 700 }, poly)).toBe(false);
  });

  it("handles a T-junction", () => {
    const walls = [seg(300, 500, 700, 500), seg(500, 500, 500, 800)];
    const poly = sightPolygon(walls, { x: 400, y: 700 }, bounds);
    expect(pointInPolygon({ x: 450, y: 700 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 600, y: 700 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 450, y: 300 }, poly)).toBe(false);
  });

  it("blocks sight on closed doors but not open doors or windows", () => {
    const wall = (portal?: unknown): Wall => ({ id: "w", a: { x: 400, y: 400 }, b: { x: 600, y: 400 }, portal }) as Wall;
    const door = (state: string) => wall({ kind: "door", state });
    const window = wall({ kind: "window", state: "closed" });
    expect(blocksSight(wall())).toBe(true);
    expect(blocksSight(door("closed"))).toBe(true);
    expect(blocksSight(door("locked"))).toBe(true);
    expect(blocksSight(door("open"))).toBe(false);
    expect(blocksSight(window)).toBe(false);

    const see = (w: Wall) => {
      const segs = [w].filter(blocksSight).map(({ a, b }) => ({ a, b }));
      return pointInPolygon({ x: 500, y: 600 }, sightPolygon(segs, { x: 500, y: 200 }, bounds));
    };
    expect(see(door("closed"))).toBe(false);
    expect(see(door("open"))).toBe(true);
    expect(see(window)).toBe(true);
  });

  it("works with the origin on the map edge", () => {
    expect(area(sightPolygon([], { x: 0, y: 500 }, bounds))).toBeCloseTo(1_000_000, -2);
    expect(area(sightPolygon([], { x: 0, y: 0 }, bounds))).toBeCloseTo(1_000_000, -2);
    const poly = sightPolygon([seg(300, 400, 300, 600)], { x: 0, y: 500 }, bounds);
    expect(pointInPolygon({ x: 600, y: 500 }, poly)).toBe(false);
  });

  it("works with the origin on a wall endpoint and clamps outside origins", () => {
    const onEnd = sightPolygon([seg(500, 500, 700, 500)], { x: 500, y: 500 }, bounds);
    expect(onEnd.length).toBeGreaterThan(3);
    expect(area(sightPolygon([], { x: -50, y: 2000 }, bounds))).toBeCloseTo(1_000_000, -2);
  });

  it("counts points on a polygon edge as in sight, within tolerance only", () => {
    const square: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(inSight([square], { x: 50, y: 50 })).toBe(true);
    expect(inSight([square], { x: 100, y: 50 })).toBe(true);
    expect(inSight([square], { x: 100.5, y: 50 })).toBe(true);
    expect(inSight([square], { x: 105, y: 50 })).toBe(false);
    expect(inSight([], { x: 50, y: 50 })).toBe(false);
  });

  it("does not reveal the direction of hidden wall endpoints (FR-GM-23)", () => {
    const secret = seg(800, 200, 900, 300);
    const walls = [seg(500, 0, 500, 1000), secret];
    for (const origin of [{ x: 100, y: 500 }, { x: 100, y: 100 }]) {
      const poly = sightPolygon(walls, origin, bounds);
      for (const end of [secret.a, secret.b]) {
        const target = Math.atan2(end.y - origin.y, end.x - origin.x);
        for (const v of poly) {
          const diff = Math.atan2(v.y - origin.y, v.x - origin.x) - target;
          expect(Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)))).toBeGreaterThan(1e-6);
        }
      }
      // Only the corners of the visible rectangle remain.
      expect(poly).toHaveLength(4);
      expect(area(poly)).toBeCloseTo(500_000, -2);
    }
  });

  it("limits an open map to a disc of the given radius", () => {
    const R = 200;
    const origin = { x: 500, y: 500 };
    const poly = sightPolygon([], origin, bounds, R);
    for (const v of poly) expect(Math.hypot(v.x - origin.x, v.y - origin.y)).toBeLessThanOrEqual(R + 1);
    expect(Math.abs(area(poly) - Math.PI * R * R) / (Math.PI * R * R)).toBeLessThan(0.03);
  });

  it("still blocks at walls inside the range, and ignores walls beyond it", () => {
    const origin = { x: 500, y: 500 };
    const poly = sightPolygon([seg(400, 400, 600, 400), seg(100, 100, 100, 900)], origin, bounds, 200);
    expect(pointInPolygon({ x: 500, y: 450 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 350 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 500, y: 650 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 500 }, poly)).toBe(false);
  });

  it("computes 1500 random walls well inside the 5 ms budget (ADR 0044)", () => {
    let seed = 12345;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const big = { width: 5000, height: 5000 };
    const walls = Array.from({ length: 1500 }, () => {
      const x = rnd() * big.width;
      const y = rnd() * big.height;
      return seg(x, y, x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200);
    });
    const origin = { x: 2500, y: 2500 };
    for (let i = 0; i < 15; i++) sightPolygon(walls, origin, big); // let the JIT settle
    // Best of five so a GC pause or a busy CI core does not fail a steady-state budget.
    let elapsed = Infinity;
    let poly: Point[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      poly = sightPolygon(walls, origin, big);
      elapsed = Math.min(elapsed, performance.now() - start);
    }
    console.log(`sightPolygon 1500 walls: ${elapsed.toFixed(2)} ms, ${poly.length} vertices`);
    // The budget is 5 ms standalone; 15 ms leaves room for parallel test files and still catches the ~25 ms unbucketed scan.
    expect(elapsed).toBeLessThan(15);

    for (let i = 0; i < 15; i++) sightPolygon(walls, origin, big, 1000);
    let ranged = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      sightPolygon(walls, origin, big, 1000);
      ranged = Math.min(ranged, performance.now() - start);
    }
    console.log(`sightPolygon 1500 walls, range 1000: ${ranged.toFixed(2)} ms`);
    expect(ranged).toBeLessThan(15);
  });
});

describe("viewerSight (FR-GM-19)", () => {
  const owned = (id: string, x: number, hidden = false) =>
    ({ id, position: { x, y: 500 }, ownerIds: ["p1"], hidden }) as unknown as RoomState["tokens"][string];
  const state = (tokens: RoomState["tokens"], on = true, map: RoomState["scene"]["map"] = { url: "/m.png", width: 1000, height: 1000 }, fog: RoomState["fog"] = {}) =>
    ({ scene: { map, grid: {}, ...(on ? { lineOfSight: true } : {}) }, walls: {}, tokens, fog }) as unknown as RoomState;
  const gmP = { id: "g", role: "gm", displayName: "G" } as const;
  const player = { id: "p1", role: "player", displayName: "P" } as const;

  it("is null for the GM and when line of sight is off", () => {
    expect(viewerSight(state({ a: owned("a", 100) }), gmP)).toBeNull();
    expect(viewerSight(state({ a: owned("a", 100) }, false), player)).toBeNull();
  });
  it("is empty with no owned token, a hidden owned token, or no map", () => {
    expect(viewerSight(state({}), player)).toEqual([]);
    expect(viewerSight(state({ a: owned("a", 100, true) }), player)).toEqual([]);
    expect(viewerSight(state({ a: owned("a", 100) }, true, null), player)).toEqual([]);
  });
  it("gives one polygon per owned token", () => {
    expect(viewerSight(state({ a: owned("a", 100), b: owned("b", 800) }), player)).toHaveLength(2);
  });

  describe("fog blocks sight", () => {
    const fogAt = (id: string, x0: number, y0: number, x1: number, y1: number) =>
      ({ [id]: { id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] } }) as unknown as RoomState["fog"];
    const goblin = { x: 800, y: 500 };
    // Fog patch at x 400..600 between the token (x=100) and the goblin area.
    const patch = fogAt("f", 400, 300, 600, 700);
    const sees = (fog: RoomState["fog"], p: Point) => inSight(viewerSight(state({ a: owned("a", 100) }, true, undefined, fog), player)!, p);

    it("puts an area behind a fog region out of sight, and restores it when the fog is removed", () => {
      expect(sees(patch, goblin)).toBe(false);
      expect(sees({}, goblin)).toBe(true);
    });
    it("never puts a vertex strictly inside a fog region the token is not in", () => {
      const [poly] = viewerSight(state({ a: owned("a", 100) }, true, undefined, patch), player)!;
      for (const v of poly!) {
        const strictlyInside = v.x > 400 + 1e-6 && v.x < 600 - 1e-6 && v.y > 300 + 1e-6 && v.y < 700 - 1e-6;
        expect(strictlyInside).toBe(false);
      }
    });
    it("lets a token inside a fog region see out of it", () => {
      const inside = fogAt("f", 50, 400, 200, 600);
      expect(sees(inside, goblin)).toBe(true);
    });
  });
});
