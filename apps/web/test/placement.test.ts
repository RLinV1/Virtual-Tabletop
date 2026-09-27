import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec, type RoomState } from "@vtt/shared";
import { autoPlacementPoint, footprint, placementPoint } from "../src/board/placement";

const grid: GridSpec = DEFAULT_GRID; // 70 px cells
const offsetGrid: GridSpec = { ...DEFAULT_GRID, offsetX: 10, offsetY: 20 };

describe("placing a new token on the board (place-token-on-board)", () => {
  it("drops a medium token in the centre of the square under the pointer", () => {
    expect(placementPoint({ x: 150, y: 80 }, 1, grid, false)).toEqual({ x: 175, y: 105 });
    expect(placementPoint({ x: 150, y: 80 }, 1, offsetGrid, false)).toEqual({ x: 185, y: 55 });
  });

  it("drops a large token on the grid corner nearest the pointer, covering four squares", () => {
    const at = placementPoint({ x: 150, y: 80 }, 2, grid, false);
    expect(at).toEqual({ x: 140, y: 70 });
    expect(footprint(at, 2, grid)).toEqual({ x: 70, y: 0, width: 140, height: 140 });
  });

  it("highlights exactly the square a medium token lands in", () => {
    expect(footprint({ x: 175, y: 105 }, 1, grid)).toEqual({ x: 140, y: 70, width: 70, height: 70 });
  });

  it("places exactly at the pointer with Alt", () => {
    expect(placementPoint({ x: 150, y: 80 }, 1, grid, true)).toEqual({ x: 150, y: 80 });
  });

  it("places automatically around the map centre, a new square for each token", () => {
    const state = (tokens: number) =>
      ({
        scene: { map: { url: "/m.webp", width: 1400, height: 1400 }, grid },
        tokens: Object.fromEntries(Array.from({ length: tokens }, (_, i) => [`t${i}`, {}])),
      }) as unknown as RoomState;
    const first = autoPlacementPoint(state(0), 1);
    const second = autoPlacementPoint(state(1), 1);
    expect(first).not.toEqual(second);
    expect(placementPoint(first, 1, grid, false)).toEqual(first);
  });
});
