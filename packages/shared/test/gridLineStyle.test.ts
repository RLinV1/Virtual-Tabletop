import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, GRID_LINE_WIDTHS, GridSpec, gridLineStyle, reduce, type DomainEvent } from "../src";
import { alice, attempt, baseRoom, gm, run } from "./fixtures";

const styled: GridSpec = { ...DEFAULT_GRID, lineColor: "#ff3355", lineWidth: 4, lineOpacity: 0.8 };

describe("grid line style (grid-line-style, ADR 0005)", () => {
  it("accepts a colour, a width in range and an opacity in range", () => {
    expect(GridSpec.parse(styled)).toEqual(styled);
    for (const w of GRID_LINE_WIDTHS) expect(() => GridSpec.parse({ ...DEFAULT_GRID, lineWidth: w })).not.toThrow();
  });

  it("rejects malformed colours and out-of-range widths and opacities", () => {
    for (const bad of [
      { lineColor: "red" },
      { lineColor: "#fff" },
      { lineWidth: 0 },
      { lineWidth: 9 },
      { lineOpacity: 0 },
      { lineOpacity: 1.5 },
    ]) {
      expect(() => GridSpec.parse({ ...DEFAULT_GRID, ...bad })).toThrow();
    }
  });

  it("resolves an unstyled grid to the historical look", () => {
    expect(gridLineStyle(DEFAULT_GRID)).toEqual({ color: "#000000", width: 1, opacity: 0.35 });
    expect(gridLineStyle(styled)).toEqual({ color: "#ff3355", width: 4, opacity: 0.8 });
  });

  it("carries the style in the grid and the replaced style in previous, so undo restores it (invariant 6)", () => {
    const first = run(baseRoom(), gm, { type: "scene.setGrid", grid: styled });
    expect(first.events[0]).toMatchObject({ type: "GridSet", grid: styled, previous: DEFAULT_GRID });
    expect(first.state.scene.grid).toEqual(styled);

    const lighter = { ...styled, lineColor: "#ffffff", lineOpacity: 0.5 };
    const second = run(first.state, gm, { type: "scene.setGrid", grid: lighter });
    expect(second.events[0]).toMatchObject({ grid: lighter, previous: styled });
  });

  it("stays GM-only: a player cannot restyle the grid (invariant 7)", () => {
    expect(attempt(baseRoom(), alice, { type: "scene.setGrid", grid: styled }).ok).toBe(false);
  });

  it("replays a GridSet stored before the style fields existed and draws the old look", () => {
    // Unparsed, as the Postgres store hands it back.
    const legacy = { type: "GridSet", grid: { ...DEFAULT_GRID, cellSize: 64 }, previous: DEFAULT_GRID } as DomainEvent;
    const state = reduce(baseRoom(), legacy);
    expect(state.scene.grid.cellSize).toBe(64);
    expect(gridLineStyle(state.scene.grid)).toEqual({ color: "#000000", width: 1, opacity: 0.35 });
  });
});
