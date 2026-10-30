import { describe, expect, it } from "vitest";
import { Command, decide, formatActivity, reduce, Scene, DEFAULT_GRID, type CommandInput, type RoomState } from "../src";
import { alice, attempt, baseRoom, ctx, gm, run } from "./fixtures";

const SET_ON: CommandInput = { type: "scene.setLineOfSight", enabled: true };
let n = 0;
/** Decide, then reduce under one command id so the undo history records the action. */
function act(state: RoomState, input: CommandInput) {
  const d = decide(state, gm, Command.parse(input), ctx);
  if (!d.ok) throw new Error(d.message);
  const commandId = `los-${++n}`;
  return { state: d.events.reduce((s, e) => reduce(s, e, { commandId, actorId: gm.id }), state), events: d.events, commandId };
}

describe("line of sight toggle (FR-GM-19)", () => {
  it("parses a scene from before the field existed and counts it as off", () => {
    const scene = Scene.parse({ map: null, grid: DEFAULT_GRID });
    expect(scene.lineOfSight).toBeUndefined();
    expect(run(baseRoom(), gm, SET_ON).events[0]).toMatchObject({ from: false });
  });

  it("lets the GM turn it on, recording the replaced value", () => {
    const { state, events } = run(baseRoom(), gm, SET_ON);
    expect(events).toEqual([{ type: "LineOfSightSet", from: false, to: true }]);
    expect(state.scene.lineOfSight).toBe(true);
  });

  it("forbids players", () => {
    expect(attempt(baseRoom(), alice, SET_ON)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects setting the value the room already has", () => {
    expect(attempt(baseRoom(), gm, { type: "scene.setLineOfSight", enabled: false })).toMatchObject({ ok: false, code: "invalid", message: "Line of sight is already off." });
    const on = run(baseRoom(), gm, SET_ON).state;
    expect(attempt(on, gm, SET_ON)).toMatchObject({ ok: false, code: "invalid", message: "Line of sight is already on." });
  });

  it("undoes by a compensating event", () => {
    const on = act(baseRoom(), SET_ON);
    const undone = act(on.state, { type: "history.undo", commandId: on.commandId });
    expect(undone.events[0]).toEqual({ type: "LineOfSightSet", from: true, to: false });
    expect(undone.state.scene.lineOfSight).toBe(false);
  });

  it("refuses undo when it was changed since", () => {
    const on = act(baseRoom(), SET_ON);
    const off = act(on.state, { type: "scene.setLineOfSight", enabled: false });
    expect(attempt(off.state, gm, { type: "history.undo", commandId: on.commandId })).toMatchObject({ ok: false });
  });

  it("writes the activity line", () => {
    const line = (to: boolean) => formatActivity({ type: "LineOfSightSet", from: !to, to }, "Mara", baseRoom());
    expect(line(true)).toBe("Mara turned line of sight on");
    expect(line(false)).toBe("Mara turned line of sight off");
  });
});
