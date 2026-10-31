import { describe, expect, it } from "vitest";
import { inSight, isInFog, sightPolygon, viewerSight, type Participant, type Point, type RoomState, type Segment } from "../src";

const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const big = { width: 10000, height: 10000 };

const lcg = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

function expectSame(a: Point[], b: Point[]) {
  expect(a.length).toBe(b.length);
  a.forEach((p, i) => {
    expect(Math.abs(p.x - b[i]!.x)).toBeLessThan(1e-6);
    expect(Math.abs(p.y - b[i]!.y)).toBeLessThan(1e-6);
  });
}

describe("sight outline never encodes hidden geometry (FR-GM-23, ADR 0044)", () => {
  it("is identical with or without walls fully behind a tilted wall the token hugs", () => {
    const blocker = seg(4000.37, 5000.11, 6000.83, 5003.71);
    // Unit normal pointing up-left of the wall; the token stands 0.5 px off it.
    const len = Math.hypot(2000.46, 3.6);
    const n = { x: 3.6 / len, y: -2000.46 / len };
    const mid = { x: 5000.6, y: 5001.91 };
    const token = { x: mid.x + n.x * 0.5, y: mid.y + n.y * 0.5 };
    const hidden = [seg(4300.123, 5400.456, 5200.789, 5600.321), seg(5000.5, 6000.25, 5100.75, 8000.125), seg(4500.9, 7000.1, 5500.3, 7100.7)];
    expectSame(sightPolygon([blocker], token, big), sightPolygon([blocker, ...hidden], token, big));
  });

  it("is identical with or without walls inside a tilted fog region the token stands just outside", () => {
    const fog = { f: { id: "f", shape: "poly", points: [{ x: 4000.3, y: 5000.2 }, { x: 6000.7, y: 5003.9 }, { x: 6001.1, y: 7000.4 }, { x: 3999.6, y: 7001.9 }] } };
    const len = Math.hypot(2000.4, 3.7);
    // 1.5 px outside the top edge: 0.5 px would already count as in the fog (see the edge tests below).
    const token = { x: 5000.5 + (3.7 / len) * 1.5, y: 5002.05 - (2000.4 / len) * 1.5 };
    const wall = (id: string, a: Point, b: Point) => ({ id, a, b });
    const hidden = Object.fromEntries(
      [
        wall("w1", { x: 4300.123, y: 5400.456 }, { x: 5200.789, y: 5600.321 }),
        wall("w2", { x: 5000.5, y: 6000.25 }, { x: 5100.75, y: 6800.125 }),
      ].map((w) => [w.id, w]),
    );
    const player = { id: "p1", role: "player", displayName: "P" } as Participant;
    const polyFor = (walls: object) =>
      viewerSight(
        { scene: { map: { url: "/m.png", ...big }, grid: {}, lineOfSight: true }, walls, tokens: { a: { id: "a", position: token, ownerIds: ["p1"], hidden: false } }, fog } as unknown as RoomState,
        player,
      )![0]!;
    expect(isInFog(fog as unknown as RoomState["fog"], token)).toBe(false);
    expectSame(polyFor({}), polyFor(hidden));
  });

  it("is identical with or without hidden walls when a sight range is set", () => {
    const blocker = seg(4000.37, 5000.11, 6000.83, 5003.71);
    const len = Math.hypot(2000.46, 3.6);
    const token = { x: 5000.6 + (3.6 / len) * 0.5, y: 5001.91 - (2000.46 / len) * 0.5 };
    const hidden = [seg(4300.123, 5400.456, 5200.789, 5600.321), seg(5000.5, 6000.25, 5100.75, 8000.125)];
    expectSame(sightPolygon([blocker], token, big, 1500), sightPolygon([blocker, ...hidden], token, big, 1500));
  });

  it("is identical over 50 seeded random rooms with the token 1 px from the wall", () => {
    const rnd = lcg(20260101);
    for (let room = 0; room < 50; room++) {
      const c = { x: 3000 + rnd() * 4000, y: 3000 + rnd() * 4000 };
      const th = rnd() * Math.PI * 2;
      const t = { x: Math.cos(th), y: Math.sin(th) };
      const n = { x: -t.y, y: t.x };
      const at = (along: number, off: number) => ({ x: c.x + t.x * along + n.x * off, y: c.y + t.y * along + n.y * off });
      const blocker = { a: at(-800, 0), b: at(800, 0) };
      const token = at((rnd() - 0.5) * 200, 1);
      const hidden = Array.from({ length: 6 }, () => ({ a: at((rnd() - 0.5) * 1200, -(50 + rnd() * 2000)), b: at((rnd() - 0.5) * 1200, -(50 + rnd() * 2000)) }));
      expectSame(sightPolygon([blocker], token, big), sightPolygon([blocker, ...hidden], token, big));
    }
  });
});

describe("fog edge counts as in fog for concealment and the sight exemption (FR-GM-17, FR-GM-23)", () => {
  const rect = [{ x: 400, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 700 }, { x: 400, y: 700 }];
  const fog = { f: { id: "f", shape: "rect", points: rect } } as unknown as RoomState["fog"];
  const wallsIn = [seg(450, 400, 550, 420), seg(450, 600, 550, 580)];
  const walls = Object.fromEntries(wallsIn.map((w, i) => [`w${i}`, { id: `w${i}`, ...w }]));
  const player = { id: "p1", role: "player", displayName: "P" } as Participant;
  const cases: [string, Point, boolean][] = [
    ["left edge", { x: 400, y: 500 }, true],
    ["right edge", { x: 600, y: 500 }, true],
    ["top edge", { x: 500, y: 300 }, true],
    ["bottom edge", { x: 500, y: 700 }, true],
    ["top-left corner", { x: 400, y: 300 }, true],
    ["top-right corner", { x: 600, y: 300 }, true],
    ["bottom-right corner", { x: 600, y: 700 }, true],
    ["bottom-left corner", { x: 400, y: 700 }, true],
    ["point 3 px outside", { x: 603, y: 500 }, false],
  ];
  it.each(cases)("agrees for a token on the %s", (_name, pos, expectedInFog) => {
    const state = {
      scene: { map: { url: "/m.png", width: 1000, height: 1000 }, grid: {}, lineOfSight: true },
      walls,
      tokens: { a: { id: "a", position: pos, ownerIds: ["p1"], hidden: false } },
      fog,
    } as unknown as RoomState;
    const polys = viewerSight(state, player)!;
    const inFog = isInFog(fog, pos);
    expect(inFog).toBe(expectedInFog);
    // Exempt exactly when in fog (then it sees inside); otherwise no vertex lands on a hidden wall endpoint.
    expect(wallsIn.some((w) => [w.a, w.b].some((e) => inSight(polys, e)))).toBe(inFog);
    if (!inFog) {
      for (const v of polys[0]!) for (const w of wallsIn) for (const e of [w.a, w.b]) expect(Math.hypot(v.x - e.x, v.y - e.y)).toBeGreaterThan(1e-6);
    }
  });
});
