import { describe, expect, it } from "vitest";
import { MAX_WALLS, Portal, SHIPPED_MAPS, storedWallsFor } from "../src";

describe("shipped map stored walls (FR-GM-09, FR-GM-19)", () => {
  const withWalls = SHIPPED_MAPS.filter((m) => m.walls);

  it("has a stored wall set for Sunken Crypt", () => {
    expect(withWalls.map((m) => m.slug)).toContain("sunken-crypt");
  });

  for (const m of withWalls) {
    it(`${m.slug}: walls are inside the map, have distinct ends, fit MAX_WALLS and parse portals`, () => {
      const walls = m.walls!;
      expect(walls.length).toBeGreaterThan(0);
      expect(walls.length).toBeLessThanOrEqual(MAX_WALLS);
      for (const w of walls) {
        for (const p of [w.a, w.b]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(m.width);
          expect(p.y).toBeLessThanOrEqual(m.height);
        }
        expect(w.a.x !== w.b.x || w.a.y !== w.b.y).toBe(true);
        if (w.portal) expect(Portal.safeParse(w.portal).success).toBe(true);
      }
    });
  }
});

describe("storedWallsFor (FR-GM-09, FR-GM-19)", () => {
  const crypt = SHIPPED_MAPS.find((m) => m.slug === "sunken-crypt")!;

  it("returns the walls for the exact map", () => {
    expect(storedWallsFor(crypt)).toBe(crypt.walls);
  });

  it("returns null for a size mismatch and an unknown URL", () => {
    expect(storedWallsFor({ url: crypt.url, width: crypt.width + 1, height: crypt.height })).toBeNull();
    expect(storedWallsFor({ url: crypt.url, width: crypt.width, height: crypt.height - 1 })).toBeNull();
    expect(storedWallsFor({ url: "/uploads/mine.png", width: crypt.width, height: crypt.height })).toBeNull();
  });

  it("has stored walls for every built-in map, each matched to its own map", () => {
    for (const m of SHIPPED_MAPS) expect(storedWallsFor(m)).toBe(m.walls);
  });
});
