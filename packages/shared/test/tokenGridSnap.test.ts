import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, isSnapped, reduceAll, type GridSpec, type RoomState } from "../src";
import { baseRoom, gm, run } from "./fixtures";

/** DEFAULT_GRID is 70 px cells at offset 0: cell (1, 1) is centred on (105, 105). */
function place(state: RoomState, name: string, position: { x: number; y: number }, size = 1) {
  const { state: next, events } = run(state, gm, { type: "token.create", name, position, size });
  const created = events[0]!;
  if (created.type !== "TokenCreated") throw new Error("expected TokenCreated");
  return { state: next, id: created.token.id };
}

const smaller: GridSpec = { ...DEFAULT_GRID, cellSize: 64, offsetX: 10, offsetY: 20 };

describe("tokens stay in a cell when the grid changes (KAN-74, FR-TAC-02)", () => {
  it("moves each grid-aligned token to the nearest cell of the new grid", () => {
    const a = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const b = place(a.state, "Ogre", { x: 280, y: 140 }, 2);
    const { state, events } = run(b.state, gm, { type: "scene.setGrid", grid: smaller });

    expect(events[0]).toMatchObject({ type: "GridSet", grid: smaller });
    expect(events.slice(1)).toEqual([
      { type: "TokenMoved", tokenId: a.id, from: { x: 105, y: 105 }, to: { x: 106, y: 116 } },
      { type: "TokenMoved", tokenId: b.id, from: { x: 280, y: 140 }, to: { x: 266, y: 148 } },
    ]);
    expect(isSnapped(state.tokens[a.id]!.position, 1, smaller)).toBe(true);
    expect(isSnapped(state.tokens[b.id]!.position, 2, smaller)).toBe(true);
  });

  it("leaves tokens placed off the grid on purpose where they are", () => {
    const free = place(baseRoom(), "Wisp", { x: 100, y: 93 });
    const { state, events } = run(free.state, gm, { type: "scene.setGrid", grid: smaller });
    expect(events).toHaveLength(1);
    expect(state.tokens[free.id]!.position).toEqual({ x: 100, y: 93 });
  });

  it("moves nothing when a grid change keeps the token's spot aligned", () => {
    const t = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const restyled = { ...DEFAULT_GRID, lineOpacity: 0.5 };
    expect(run(t.state, gm, { type: "scene.setGrid", grid: restyled }).events).toHaveLength(1);
  });

  it("re-snaps tokens when a map is placed with its own grid", () => {
    const t = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const { events } = run(t.state, gm, {
      type: "scene.setMap", map: { url: "/uploads/keep.png", width: 1400, height: 1000 }, grid: smaller,
    });
    expect(events.map((e) => e.type)).toEqual(["MapSet", "TokenMoved"]);
  });

  it("undoes cleanly: the moves carry where each token was", () => {
    const t = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const { state, events } = run(t.state, gm, { type: "scene.setGrid", grid: smaller });
    const moved = events[1]!;
    if (moved.type !== "TokenMoved") throw new Error("expected TokenMoved");
    const back = reduceAll(state, [{ ...moved, from: moved.to, to: moved.from }]);
    expect(back.tokens[t.id]!.position).toEqual({ x: 105, y: 105 });
  });
});

describe("tokens stay in a cell when their size changes (KAN-74, FR-TAC-02)", () => {
  it("puts a size-2 token set to size 1 in its top-left cell", () => {
    const t = place(baseRoom(), "Ogre", { x: 140, y: 140 }, 2);
    const { state, events } = run(t.state, gm, { type: "token.configure", tokenId: t.id, changes: { size: 1 } });
    expect(events.map((e) => e.type)).toEqual(["TokenAppearanceSet", "TokenMoved"]);
    expect(state.tokens[t.id]!.position).toEqual({ x: 105, y: 105 });
  });

  it("anchors a size-1 token grown to size 2 at its top-left cell", () => {
    const t = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const { state } = run(t.state, gm, { type: "token.configure", tokenId: t.id, changes: { size: 2 } });
    expect(state.tokens[t.id]!.position).toEqual({ x: 140, y: 140 });
  });

  it("does the same through token.setAppearance", () => {
    const t = place(baseRoom(), "Ogre", { x: 140, y: 140 }, 2);
    const { state } = run(t.state, gm, { type: "token.setAppearance", tokenId: t.id, name: "Ogre", size: 1, rotation: 0 });
    expect(state.tokens[t.id]!.position).toEqual({ x: 105, y: 105 });
  });

  it("keeps an explicit position sent with the size", () => {
    const t = place(baseRoom(), "Ogre", { x: 140, y: 140 }, 2);
    const { state } = run(t.state, gm, {
      type: "token.configure", tokenId: t.id, changes: { size: 1, position: { x: 315, y: 315 } },
    });
    expect(state.tokens[t.id]!.position).toEqual({ x: 315, y: 315 });
  });

  it("leaves a token resized to a fractional size where it is", () => {
    const t = place(baseRoom(), "Fighter", { x: 105, y: 105 });
    const { state, events } = run(t.state, gm, { type: "token.configure", tokenId: t.id, changes: { size: 1.5 } });
    expect(events.map((e) => e.type)).toEqual(["TokenAppearanceSet"]);
    expect(state.tokens[t.id]!.position).toEqual({ x: 105, y: 105 });
  });

  it("leaves an off-grid token where it is", () => {
    const t = place(baseRoom(), "Wisp", { x: 100, y: 93 }, 2);
    const { state, events } = run(t.state, gm, { type: "token.configure", tokenId: t.id, changes: { size: 1 } });
    expect(events.map((e) => e.type)).toEqual(["TokenAppearanceSet"]);
    expect(state.tokens[t.id]!.position).toEqual({ x: 100, y: 93 });
  });
});
