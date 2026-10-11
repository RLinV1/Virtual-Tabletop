import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type FogRegion, type GridSpec, type MapImage } from "@vtt/shared";
import { coversWholeMap, describeCells, wholeMapRegion } from "../src/panels/fogCells";

const map: MapImage = { url: "/uploads/map.png", width: 700, height: 350 };
const grid: GridSpec = DEFAULT_GRID; // 70 px cells, no offset: 10 columns, 5 rows

function rect(id: string, x0: number, y0: number, x1: number, y1: number): FogRegion {
  return { id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}

describe("fog of war: naming regions by grid cells (FR-GM-17)", () => {
  it("describes a region by the cells it covers", () => {
    expect(describeCells(rect("a", 70, 70, 210, 280), map, grid)).toBe("columns 2–3, rows 2–4");
    expect(describeCells(rect("b", 0, 0, 70, 70), map, grid)).toBe("column 1, row 1");
    // A polygon is described by the cells its bounding box touches.
    const triangle: FogRegion = { id: "c", shape: "polygon", points: [{ x: 100, y: 10 }, { x: 300, y: 10 }, { x: 200, y: 200 }] };
    expect(describeCells(triangle, map, grid)).toBe("columns 2–5, rows 1–3");
  });

  it("recognises the whole-map rectangle so the list can name it", () => {
    const whole = wholeMapRegion(map);
    expect(whole).toEqual({ shape: "rect", from: { x: 0, y: 0 }, to: { x: 700, y: 350 } });
    expect(coversWholeMap(rect("w", 0, 0, 700, 350), map)).toBe(true);
    expect(coversWholeMap(rect("p", 0, 0, 350, 350), map)).toBe(false);
    expect(coversWholeMap({ id: "t", shape: "polygon", points: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 350 }] }, map)).toBe(false);
  });
});
