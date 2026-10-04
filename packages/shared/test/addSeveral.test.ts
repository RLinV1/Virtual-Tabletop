import { describe, expect, it } from "vitest";
import { Command, DEFAULT_GRID, spreadPositions, type Token } from "../src";
import { alice, attempt, baseRoom, gm, run } from "./fixtures";

const grid = DEFAULT_GRID; // 70 px cells
const map = { width: 700, height: 700 };
const c = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });

describe("spreadPositions (KAN-70)", () => {
  it("puts one token on the origin", () => {
    expect(spreadPositions(c(4, 4), 1, 1, grid, map, [])).toEqual([c(4, 4)]);
  });

  it("fills the first ring row by row", () => {
    expect(spreadPositions(c(4, 4), 1, 4, grid, map, [])).toEqual([c(4, 4), c(3, 3), c(4, 3), c(5, 3)]);
  });

  it("skips squares that already hold a token", () => {
    expect(spreadPositions(c(4, 4), 1, 3, grid, map, [{ position: c(3, 3), size: 1 }])).toEqual([c(4, 4), c(4, 3), c(5, 3)]);
  });

  it("skips a square an off-grid token only partly covers", () => {
    // A token at (295, 245) covers 260..330 × 210..280, which overlaps cell (3, 3)'s 210..280.
    const out = spreadPositions(c(4, 4), 1, 2, grid, map, [{ position: { x: 295, y: 245 }, size: 1 }]);
    expect(out[1]).not.toEqual(c(3, 3));
  });

  it("keeps a large copy's whole footprint on the map", () => {
    // Size 2 (140 px) from the top-left: no copy may hang over the edge.
    for (const p of spreadPositions({ x: 70, y: 70 }, 2, 4, grid, map, [])) {
      expect(p.x - 70).toBeGreaterThanOrEqual(0);
      expect(p.y - 70).toBeGreaterThanOrEqual(0);
    }
  });

  it("stays on the map at a corner", () => {
    const out = spreadPositions(c(0, 0), 1, 4, grid, map, []);
    expect(out).toEqual([c(0, 0), c(1, 0), c(0, 1), c(1, 1)]);
  });

  it("spaces large tokens a footprint apart", () => {
    const origin = { x: 280, y: 280 };
    const [, second] = spreadPositions(origin, 2, 2, grid, map, []);
    expect(second).toEqual({ x: 140, y: 140 });
  });

  it("bounds the search for a schema-valid tiny token outside the map", () => {
    const command = Command.parse({ type: "token.create", name: "Tiny", position: { x: -1000, y: -1000 }, size: 0.000001, count: 2 });
    if (command.type !== "token.create") throw new Error("Expected token.create");
    expect(spreadPositions(command.position, command.size, command.count, grid, map, []))
      .toEqual([command.position, command.position]);
  });

  it("falls back after the bounded search when nearby squares are occupied", () => {
    const origin = c(4, 4);
    expect(spreadPositions(origin, 1, 20, grid, null, [{ position: origin, size: 100 }]))
      .toEqual(Array.from({ length: 20 }, () => origin));
  });

  it("visits the sides of a ring in row order", () => {
    expect(spreadPositions(c(4, 4), 1, 9, grid, map, []))
      .toEqual([c(4, 4), c(3, 3), c(4, 3), c(5, 3), c(3, 4), c(5, 4), c(3, 5), c(4, 5), c(5, 5)]);
  });
  it("shares the origin once the map is full", () => {
    const tiny = { width: 70, height: 70 };
    expect(spreadPositions(c(0, 0), 1, 3, grid, tiny, [])).toEqual([c(0, 0), c(0, 0), c(0, 0)]);
  });
});

describe("add several tokens (KAN-70)", () => {
  const names = (tokens: Record<string, Token>) => Object.values(tokens).map((t) => t.name).sort();
  const withMap = () => run(baseRoom(), gm, { type: "scene.setMap", map: { url: "/u/m.png", width: 700, height: 700 } }).state;

  it("creates them in one action, numbered, on free squares, with the given conditions", () => {
    const { state, events } = run(withMap(), gm, {
      type: "token.create", name: "Goblin", position: c(4, 4), count: 4, conditions: ["prone"], color: "#2e7d32",
    });
    expect(events).toHaveLength(4);
    expect(names(state.tokens)).toEqual(["Goblin", "Goblin 2", "Goblin 3", "Goblin 4"]);
    const tokens = Object.values(state.tokens);
    expect(new Set(tokens.map((t) => `${t.position.x},${t.position.y}`)).size).toBe(4);
    expect(tokens.every((t) => t.conditions.join() === "prone" && t.color === "#2e7d32")).toBe(true);
  });

  it("numbers after names already in use", () => {
    const first = run(withMap(), gm, { type: "token.create", name: "Goblin", position: c(1, 1) }).state;
    const { state } = run(first, gm, { type: "token.create", name: "Goblin", position: c(6, 6), count: 2 });
    expect(names(state.tokens)).toEqual(["Goblin", "Goblin 2", "Goblin 3"]);
  });

  it("keeps every copy hidden when asked", () => {
    const { state } = run(withMap(), gm, { type: "token.create", name: "Orc", position: c(4, 4), count: 3, hidden: true });
    expect(Object.values(state.tokens).every((t) => t.hidden)).toBe(true);
  });

  it("refuses 0, 21, duplicate conditions, and players", () => {
    expect(Command.safeParse({ type: "token.create", name: "X", position: c(1, 1), count: 0 }).success).toBe(false);
    expect(Command.safeParse({ type: "token.create", name: "X", position: c(1, 1), count: 21 }).success).toBe(false);
    expect(attempt(withMap(), gm, { type: "token.create", name: "X", position: c(1, 1), conditions: ["prone", "prone"] }))
      .toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(withMap(), alice, { type: "token.create", name: "X", position: c(1, 1), count: 2 }))
      .toMatchObject({ ok: false, code: "forbidden" });
  });
});
