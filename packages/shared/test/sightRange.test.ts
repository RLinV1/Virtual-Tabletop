import { describe, expect, it } from "vitest";
import { Command, decide, filterEventForViewer, filterStateForViewer, formatActivity, reduce, Scene, DEFAULT_GRID, type CommandInput, type RoomState, type Token } from "../src";
import { alice, attempt, baseRoom, ctx, gm, run } from "./fixtures";

const SET = (range: number | null): CommandInput => ({ type: "scene.setSightRange", range });
let n = 0;
/** Decide, then reduce under one command id so the undo history records the action. */
function act(state: RoomState, input: CommandInput) {
  const d = decide(state, gm, Command.parse(input), ctx);
  if (!d.ok) throw new Error(d.message);
  const commandId = `sr-${++n}`;
  return { state: d.events.reduce((s, e) => reduce(s, e, { commandId, actorId: gm.id }), state), events: d.events, commandId };
}

describe("sight range (FR-GM-19)", () => {
  it("parses a scene from before the field existed and counts it as unlimited", () => {
    const scene = Scene.parse({ map: null, grid: DEFAULT_GRID });
    expect(scene.sightRange).toBeUndefined();
    expect(run(baseRoom(), gm, SET(30)).events[0]).toMatchObject({ from: null });
  });

  it("lets the GM set and clear it, recording the replaced value", () => {
    const set = run(baseRoom(), gm, SET(30));
    expect(set.events).toEqual([{ type: "SightRangeSet", from: null, to: 30 }]);
    expect(set.state.scene.sightRange).toBe(30);
    const cleared = run(set.state, gm, SET(null));
    expect(cleared.events).toEqual([{ type: "SightRangeSet", from: 30, to: null }]);
    expect(cleared.state.scene.sightRange).toBeUndefined();
  });

  it("forbids players", () => {
    expect(attempt(baseRoom(), alice, SET(30))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects setting the value the room already has", () => {
    expect(attempt(baseRoom(), gm, SET(null))).toMatchObject({ ok: false, code: "invalid", message: "Sight range is already unlimited." });
    const set = run(baseRoom(), gm, SET(30)).state;
    expect(attempt(set, gm, SET(30))).toMatchObject({ ok: false, code: "invalid", message: "Sight range is already 30." });
  });

  it("rejects non-positive ranges and ranges over 1000 squares", () => {
    expect(Command.safeParse(SET(0)).success).toBe(false);
    expect(Command.safeParse(SET(-5)).success).toBe(false);
    expect(Command.safeParse(SET(Infinity)).success).toBe(false);
    const limit = 1000 * baseRoom().scene.grid.unitsPerCell;
    expect(attempt(baseRoom(), gm, SET(limit))).toMatchObject({ ok: true });
    expect(attempt(baseRoom(), gm, SET(limit + 1))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("undoes by a compensating event, and refuses when changed since", () => {
    const set = act(baseRoom(), SET(30));
    const undone = act(set.state, { type: "history.undo", commandId: set.commandId });
    expect(undone.events[0]).toEqual({ type: "SightRangeSet", from: 30, to: null });
    expect(undone.state.scene.sightRange).toBeUndefined();
    const changed = act(set.state, SET(60));
    expect(attempt(changed.state, gm, { type: "history.undo", commandId: set.commandId })).toMatchObject({ ok: false });
  });

  it("writes the activity line in the grid's unit", () => {
    const line = (to: number | null) => formatActivity({ type: "SightRangeSet", from: null, to }, "Mara", baseRoom());
    expect(line(60)).toBe("Mara set sight range to 60 ft");
    expect(line(null)).toBe("Mara set sight range to unlimited");
  });

  it("resyncs players", () => {
    const event = { type: "SightRangeSet", from: null, to: 30 } as const;
    expect(filterEventForViewer({ seq: 1, at: new Date(0).toISOString(), actorId: gm.id, event }, baseRoom(), alice)).toEqual({ kind: "resync" });
  });

  it("resyncs players on a grid change while a range is set, since the range is in squares", () => {
    const grid = (s: RoomState) => ({ type: "GridSet", grid: { ...s.scene.grid, cellSize: s.scene.grid.cellSize + 20 }, previous: s.scene.grid }) as const;
    const at = new Date(0).toISOString();
    const limited = baseRoom();
    limited.scene = { ...limited.scene, lineOfSight: true, sightRange: 30 };
    expect(filterEventForViewer({ seq: 1, at, actorId: gm.id, event: grid(limited) }, limited, alice)).toEqual({ kind: "resync" });
    const unlimited = baseRoom();
    unlimited.scene = { ...unlimited.scene, lineOfSight: true };
    expect(filterEventForViewer({ seq: 1, at, actorId: gm.id, event: grid(unlimited) }, unlimited, alice).kind).toBe("event");
  });

  it("withholds a token beyond the range in the open and keeps one inside", () => {
    const s = baseRoom();
    const tok = (id: string, x: number, owner: string[]) =>
      ({ id, name: id, position: { x, y: 500 }, size: 1, rotation: 0, color: "#ff0000", imageUrl: null, ownerIds: owner, hidden: false, stats: {}, conditions: [] }) as unknown as Token;
    // 70 px cells, 5 ft each: 30 ft = 420 px.
    const state: RoomState = {
      ...s,
      scene: { ...s.scene, map: { url: "/m.png", width: 2000, height: 1000 }, lineOfSight: true, sightRange: 30 },
      tokens: Object.fromEntries([tok("hero", 100, [alice.id]), tok("near", 400, []), tok("far", 700, [])].map((t) => [t.id, t])),
    };
    expect(Object.keys(filterStateForViewer(state, alice).tokens).sort()).toEqual(["hero", "near"]);
    const unlimited = { ...state, scene: { ...state.scene, sightRange: undefined } };
    expect(Object.keys(filterStateForViewer(unlimited, alice).tokens).sort()).toEqual(["far", "hero", "near"]);
  });
});
