import { describe, expect, it } from "vitest";
import {
  AreaTemplate,
  formatActivity,
  filterEventForViewer,
  filterStateForViewer,
  MAX_AREA_TEMPLATES,
  reduce,
  type CommandInput,
  type CommittedEvent,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, bob, gm, run } from "./fixtures";

const place = (overrides: Partial<Extract<CommandInput, { type: "template.place" }>> = {}): CommandInput => ({
  type: "template.place",
  shape: "cone",
  origin: { x: 70, y: 70 },
  toward: { x: 210, y: 70 },
  size: 15,
  ...overrides,
});

const committed = (event: CommittedEvent["event"], seq = 10): CommittedEvent => ({ seq, at: "2026-09-26T00:00:00.000Z", actorId: gm.id, event });

describe("shared area templates (FR-TAC-06, ADR 0007)", () => {
  it("lets any participant place a template everyone can see", () => {
    const { state, events } = run(baseRoom(), alice, place());
    expect(events).toHaveLength(1);
    const placed = events[0];
    if (placed?.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    expect(placed.template).toMatchObject({ shape: "cone", size: 15, ownerId: alice.id, gmOnly: false });
    expect(state.templates[placed.template.id]).toEqual(placed.template);
    expect(filterStateForViewer(state, bob).templates[placed.template.id]).toEqual(placed.template);
  });

  it("refuses a GM-only template from a player (FR-GM-15)", () => {
    expect(attempt(baseRoom(), alice, place({ gmOnly: true }))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lets the owner or the GM remove a template, but not another player", () => {
    const { state, events } = run(baseRoom(), alice, place());
    const id = events[0]!.type === "TemplatePlaced" ? events[0].template.id : "";
    expect(attempt(state, bob, { type: "template.remove", templateId: id })).toMatchObject({ ok: false, code: "forbidden" });

    const byOwner = run(state, alice, { type: "template.remove", templateId: id });
    expect(byOwner.events[0]).toMatchObject({ type: "TemplateRemoved", template: { id, ownerId: alice.id } });
    expect(byOwner.state.templates[id]).toBeUndefined();

    expect(run(state, gm, { type: "template.remove", templateId: id }).state.templates[id]).toBeUndefined();
  });

  it("carries the whole removed template so undo can restore it (invariant 6)", () => {
    const { state, events } = run(baseRoom(), gm, place({ shape: "box", size: 10 }));
    const template = events[0]!.type === "TemplatePlaced" ? events[0].template : null;
    const removed = run(state, gm, { type: "template.remove", templateId: template!.id }).events[0];
    expect(removed).toEqual({ type: "TemplateRemoved", template });
  });

  it("never sends a GM-only template to a player, in state or as an event (FR-GM-23)", () => {
    const before: RoomState = baseRoom();
    const { state, events } = run(before, gm, place({ gmOnly: true }));
    const template = events[0]!.type === "TemplatePlaced" ? events[0].template : null;

    expect(filterStateForViewer(state, alice).templates).toEqual({});
    expect(filterStateForViewer(state, gm).templates[template!.id]).toEqual(template);
    expect(filterEventForViewer(committed(events[0]!), before, alice)).toEqual({ kind: "redacted", seq: 10 });
    expect(filterEventForViewer(committed(events[0]!), before, gm)).toMatchObject({ kind: "event" });

    const removed = run(state, gm, { type: "template.remove", templateId: template!.id }).events[0]!;
    expect(filterEventForViewer(committed(removed, 11), state, alice)).toEqual({ kind: "redacted", seq: 11 });
  });

  it("answers a player removing a GM-only template exactly as if it didn't exist", () => {
    const { state, events } = run(baseRoom(), gm, place({ gmOnly: true }));
    const id = events[0]!.type === "TemplatePlaced" ? events[0].template.id : "";
    expect(attempt(state, alice, { type: "template.remove", templateId: id })).toEqual(
      attempt(state, alice, { type: "template.remove", templateId: "no-such-template" }),
    );
  });

  it("caps how many templates a room holds", () => {
    let state = baseRoom();
    for (let i = 0; i < MAX_AREA_TEMPLATES; i++) {
      state = reduce(state, {
        type: "TemplatePlaced",
        template: { id: `t${i}`, shape: "circle", origin: { x: 0, y: 0 }, toward: { x: 0, y: 0 }, size: 5, ownerId: gm.id, gmOnly: false },
      });
    }
    expect(attempt(state, alice, place())).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects a malformed template command before decide (zod at the trust boundary)", () => {
    expect(() => attempt(baseRoom(), alice, place({ size: -5 }))).toThrow();
    expect(() => attempt(baseRoom(), alice, { ...place(), shape: "hexagon" } as unknown as CommandInput)).toThrow();
    expect(() => attempt(baseRoom(), alice, place({ shape: "line", width: 0 }))).toThrow();
  });
});

describe("line templates (KAN-35, FR-TAC-06)", () => {
  it("places a line with a width, one cell when left out", () => {
    const wide = run(baseRoom(), alice, place({ shape: "line", size: 60, width: 10 }));
    expect(Object.values(wide.state.templates)[0]).toMatchObject({ shape: "line", size: 60, width: 10 });
    const plain = run(baseRoom(), alice, place({ shape: "line", size: 60 }));
    expect(Object.values(plain.state.templates)[0]).not.toHaveProperty("width");
  });

  it("refuses a line wider than 10 cells, and ignores width on other shapes", () => {
    expect(attempt(baseRoom(), alice, place({ shape: "line", size: 30, width: 55 }))).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(baseRoom(), alice, place({ shape: "line", size: 30, width: 50 })).ok).toBe(true);
    const cone = run(baseRoom(), alice, place({ shape: "cone", width: 10 }));
    expect(Object.values(cone.state.templates)[0]).not.toHaveProperty("width");
  });

  it("still reads a template placed before lines existed", () => {
    expect(AreaTemplate.safeParse({ id: "t", shape: "cone", origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 15, ownerId: "p", gmOnly: false }).success).toBe(true);
  });

  it("logs a line's length, and its width when it isn't one cell", () => {
    const state = baseRoom();
    const line = (width?: number) => ({ id: "t", shape: "line" as const, origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 60, ownerId: alice.id, gmOnly: false, ...(width && { width }) });
    expect(formatActivity({ type: "TemplatePlaced", template: line() }, "Pat", state)).toBe("Pat placed a 60 ft line");
    expect(formatActivity({ type: "TemplatePlaced", template: line(10) }, "Pat", state)).toBe("Pat placed a 60 ft line, 10 ft wide");
  });
});
