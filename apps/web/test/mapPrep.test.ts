import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec } from "@vtt/shared";
import { prepCommand, prepDirty, startPrep } from "../src/pages/mapPrep";

const map = { url: "/uploads/new.png", width: 1400, height: 700 };
const saved: GridSpec = { ...DEFAULT_GRID, cellSize: 100, offsetX: 10, offsetY: 20 };

describe("private map preparation (KAN-59)", () => {
  it("starts a library map from its saved grid, and an upload from the room's grid", () => {
    expect(startPrep(map, saved, DEFAULT_GRID).initial).toMatchObject({ cellSize: 100, offsetX: 10, offsetY: 20 });
    expect(startPrep(map, undefined, { ...DEFAULT_GRID, offsetX: 75 }).initial).toMatchObject({ cellSize: 70, offsetX: 5 });
  });

  it("is clean until the grid changes, and dirty while a field is cleared", () => {
    const prep = startPrep(map, saved, DEFAULT_GRID);
    expect(prepDirty(prep)).toBe(false);
    expect(prepDirty({ ...prep, draft: { ...prep.draft, cellSize: "90" } })).toBe(true);
    expect(prepDirty({ ...prep, draft: { ...prep.draft, cellSize: "" } })).toBe(true);
  });

  it("applies as one setMap carrying both the map and the grid", () => {
    const prep = startPrep(map, undefined, DEFAULT_GRID);
    const edited = { ...prep, draft: { ...prep.draft, cellSize: "50" } };
    expect(prepCommand(edited)).toEqual({ type: "scene.setMap", map, grid: { ...DEFAULT_GRID, cellSize: 50 } });
  });

  it("won't apply an invalid grid", () => {
    const prep = startPrep(map, undefined, DEFAULT_GRID);
    expect(prepCommand({ ...prep, draft: { ...prep.draft, cellSize: "" } })).toBeNull();
  });
});
