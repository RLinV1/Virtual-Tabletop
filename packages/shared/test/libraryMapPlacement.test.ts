import { describe, expect, it } from "vitest";
import { Command, DEFAULT_GRID, decide, reduceAll, type ResolvedLibraryMap } from "../src";
import { alice, baseRoom, gm } from "./fixtures";

const library: ResolvedLibraryMap = {
  map: { url: "/uploads/map.png", width: 400, height: 300, assetId: "library-id" },
  grid: { ...DEFAULT_GRID, cellSize: 50, offsetX: 12.5, offsetY: 25 },
  board: { walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, uvttPortal: { closed: false, rotation: 0, freestanding: true }, source: "objects_line_of_sight" }],
    fog: [{ shape: "polygon", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 20 }] }] },
};
const command = Command.parse({ type: "scene.setMap", map: library.map, includeLibraryBoard: true });

describe("atomic server-resolved library placement (FR-GM-06/07/12, ADR 0043)", () => {
  it("records image, exact grid, complete walls/metadata and fog together with server IDs", () => {
    let id = 0; const state = baseRoom();
    const decision = decide(state, gm, command, { newId: () => `room:${++id}`, libraryMap: library });
    expect(decision.ok).toBe(true); if (!decision.ok) return;
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]).toMatchObject({ type: "MapSet", map: library.map, gridChange: { grid: library.grid, previous: state.scene.grid },
      wallChange: { walls: [{ ...library.board.walls[0], id: "room:1" }], previous: [] },
      fogChange: { fog: [{ ...library.board.fog[0], id: "room:2" }], previous: [] } });
    const next = reduceAll(state, decision.events);
    expect(next.walls["room:1"]!.uvttPortal).toEqual(library.board.walls[0]!.uvttPortal);
    expect(next.scene.grid).toEqual(library.grid);
  });
  it("checks GM authority, resolved ownership, map identity and geometry before changing anything", () => {
    const state = baseRoom(); const newId = () => "unused";
    expect(decide(state, alice, command, { newId, libraryMap: library })).toMatchObject({ ok: false, code: "forbidden" });
    expect(decide(state, gm, command, { newId })).toMatchObject({ ok: false, code: "not_found" });
    expect(decide(state, gm, command, { newId, libraryMap: { ...library, map: { ...library.map, url: "/different.png" } } })).toMatchObject({ ok: false, code: "not_found" });
    expect(decide(state, gm, command, { newId, libraryMap: { ...library, board: { walls: [], fog: [{ shape: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] }] } } })).toMatchObject({ ok: false, code: "invalid" });
    expect(state.scene.map).toBeNull();
  });
  it("replaces rather than duplicates saved geometry when the same map is applied twice", () => {
    let id = 0; const ctx = { newId: () => String(++id), libraryMap: library };
    const first = decide(baseRoom(), gm, command, ctx); if (!first.ok) throw new Error(first.message);
    const state = reduceAll(baseRoom(), first.events);
    const second = decide(state, gm, command, ctx); if (!second.ok) throw new Error(second.message);
    const next = reduceAll(state, second.events);
    expect(Object.values(next.walls)).toHaveLength(1); expect(Object.values(next.fog)).toHaveLength(1);
    expect(second.events[0]).toMatchObject({ wallChange: { previous: Object.values(state.walls) }, fogChange: { previous: Object.values(state.fog) } });
  });
});
