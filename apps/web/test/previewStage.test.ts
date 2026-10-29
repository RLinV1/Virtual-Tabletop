import { describe, expect, it } from "vitest";
import { STAGE_CELL, mapPlacement, stageGridOrigin, standInPositions } from "../src/board/previewStage";

/** How far `x` is from the nearest stage grid line that starts at `origin`. */
const offLine = (x: number, origin: number) => {
  const m = (((x - origin) % STAGE_CELL) + STAGE_CELL) % STAGE_CELL;
  return Math.min(m, STAGE_CELL - m);
};

describe("animation preview stage layout (FR-TAC-09, ADR 0038)", () => {
  it("centres a grid square on the stage and stands both tokens in the middle of a square", () => {
    for (const [width, height] of [[360, 270], [530, 402], [417.5, 211]] as const) {
      const origin = stageGridOrigin(width, height);
      const { attacker, target } = standInPositions(width, height);
      for (const p of [attacker, target]) {
        expect(offLine(p.x, origin.x)).toBeCloseTo(STAGE_CELL / 2);
        expect(offLine(p.y, origin.y)).toBeCloseTo(STAGE_CELL / 2);
      }
      expect(width / 2 - attacker.x).toBeCloseTo(target.x - width / 2);
      expect(attacker.y).toBe(height / 2);
    }
  });

  it("scales a map with a grid to the stage's squares and lines its grid up with the stage's", () => {
    const map = { width: 3344, height: 1882 };
    const grid = { cellSize: 70, offsetX: 23, offsetY: 41 };
    const [width, height] = [530, 402];
    const place = mapPlacement(map, width, height, grid);
    expect(place.scale).toBeCloseTo(STAGE_CELL / 70);
    const origin = stageGridOrigin(width, height);
    for (const n of [0, 5, 31]) {
      expect(offLine(place.x + (grid.offsetX + n * grid.cellSize) * place.scale, origin.x)).toBeCloseTo(0);
      expect(offLine(place.y + (grid.offsetY + n * grid.cellSize) * place.scale, origin.y)).toBeCloseTo(0);
    }
    // Still centred, give or take half a square.
    expect(Math.abs(place.x + (map.width * place.scale) / 2 - width / 2)).toBeLessThanOrEqual(STAGE_CELL / 2);
    expect(Math.abs(place.y + (map.height * place.scale) / 2 - height / 2)).toBeLessThanOrEqual(STAGE_CELL / 2);
  });

  it("covers the stage and its bleed with a map that has no grid", () => {
    const map = { width: 1536, height: 1024 };
    const place = mapPlacement(map, 400, 400, null, 16);
    expect(place.x).toBeLessThanOrEqual(-16);
    expect(place.y).toBeCloseTo(-16);
    expect(place.x + map.width * place.scale).toBeGreaterThanOrEqual(416);
    expect(place.y + map.height * place.scale).toBeCloseTo(416);
  });
});
