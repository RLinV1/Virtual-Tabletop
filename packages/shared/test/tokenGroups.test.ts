import { describe, expect, it } from "vitest";
import { filterEventForViewer, filterStateForViewer, MAX_GROUPS, type CommandInput, type DomainEvent } from "../src";
import { committedRoom } from "./committedRoom";
import { alice, gm } from "./fixtures";

/** A room with three goblins (one hidden) and two groups. */
function table() {
  const room = committedRoom();
  const ids = ["Goblin", "Goblin", "Goblin"].map((name, i) => {
    const { events } = room.run(gm, { type: "token.create", name, position: { x: 35 + 70 * i * 2, y: 35 }, hidden: i === 2 });
    return (events[0] as Extract<DomainEvent, { type: "TokenCreated" }>).token.id;
  });
  const group = (name: string) =>
    (room.run(gm, { type: "group.create", name }).events[0] as Extract<DomainEvent, { type: "GroupCreated" }>).group.id;
  const gate = group("Gate guards");
  const patrol = group("Patrol");
  return { room, ids, gate, patrol };
}

describe("GM manages token groups (KAN-82)", () => {
  it("creates, renames and deletes groups; deleting keeps the tokens", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!, ids[1]!] });
    room.run(gm, { type: "group.rename", groupId: gate, name: "  Gate guards (north) " });
    expect(room.state.groups[gate]?.name).toBe("Gate guards (north)");
    room.run(gm, { type: "group.delete", groupId: gate });
    expect(room.state.groups[gate]).toBeUndefined();
    expect(Object.keys(room.state.tokens)).toHaveLength(3);
    expect(room.state.tokenGroups).toEqual({});
  });

  it("keeps names unique ignoring case and spaces, non-blank, and at most 40 characters", () => {
    const { room, patrol } = table();
    expect(room.attempt(gm, { type: "group.create", name: " gate GUARDS " })).toMatchObject({ ok: false, code: "invalid" });
    expect(room.attempt(gm, { type: "group.rename", groupId: patrol, name: "gate guards" })).toMatchObject({ ok: false });
    expect(room.attempt(gm, { type: "group.create", name: "   " })).toMatchObject({ ok: false });
    expect(room.attempt(gm, { type: "group.create", name: "x".repeat(41) })).toMatchObject({ ok: false });
  });

  it(`holds at most ${MAX_GROUPS} groups`, () => {
    const { room } = table();
    for (let i = 0; i < MAX_GROUPS - 2; i++) room.run(gm, { type: "group.create", name: `G${i}` });
    expect(room.attempt(gm, { type: "group.create", name: "One too many" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("allows an empty group", () => {
    const { room, patrol } = table();
    expect(room.state.groups[patrol]).toEqual({ id: patrol, name: "Patrol" });
    expect(Object.values(room.state.tokenGroups)).not.toContain(patrol);
  });

  it("puts a token in at most one group, moving it out of the old one", () => {
    const { room, ids, gate, patrol } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!, ids[1]!] });
    const { events } = room.run(gm, { type: "group.assign", groupId: patrol, tokenIds: [ids[1]!] });
    expect(events).toEqual([{ type: "TokensGrouped", groupId: patrol, changes: [{ tokenId: ids[1], previous: gate }] }]);
    expect(room.state.tokenGroups).toEqual({ [ids[0]!]: gate, [ids[1]!]: patrol });
    room.run(gm, { type: "group.assign", groupId: null, tokenIds: [ids[0]!] });
    expect(room.state.tokenGroups).toEqual({ [ids[1]!]: patrol });
  });

  it("rejects a no-op, an unknown group and an unknown token", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] });
    expect(room.attempt(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] })).toMatchObject({ ok: false, code: "invalid" });
    expect(room.attempt(gm, { type: "group.assign", groupId: "nope", tokenIds: [ids[0]!] })).toMatchObject({ ok: false, code: "not_found" });
    expect(room.attempt(gm, { type: "group.assign", groupId: gate, tokenIds: ["nope"] })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("keeps a deleted token's membership, so a restore brings it back into its group", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] });
    room.run(gm, { type: "token.delete", tokenId: ids[0]! });
    expect(room.state.tokenGroups[ids[0]!]).toBe(gate);
    expect(room.state.tokens[ids[0]!]).toBeUndefined();
  });

  it("is GM only (FR-GM-15)", () => {
    const { room, ids, gate } = table();
    for (const input of [
      { type: "group.create", name: "Mine" },
      { type: "group.rename", groupId: gate, name: "Mine" },
      { type: "group.delete", groupId: gate },
      { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] },
    ] satisfies CommandInput[]) {
      expect(room.attempt(alice, input)).toMatchObject({ ok: false, code: "forbidden" });
    }
  });
});

describe("Undo group changes and encounter starts (KAN-82, FR-REC-02)", () => {
  it("undoes a deletion, bringing the group back with its tokens", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!, ids[1]!] });
    const { commandId } = room.run(gm, { type: "group.delete", groupId: gate });
    room.run(gm, { type: "history.undo", commandId });
    expect(room.state.groups[gate]?.name).toBe("Gate guards");
    expect(room.state.tokenGroups).toEqual({ [ids[0]!]: gate, [ids[1]!]: gate });
  });

  it("undoes a reassignment back to each token's own previous group", () => {
    const { room, ids, gate, patrol } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] });
    const { commandId } = room.run(gm, { type: "group.assign", groupId: patrol, tokenIds: [ids[0]!, ids[1]!] });
    room.run(gm, { type: "history.undo", commandId });
    expect(room.state.tokenGroups).toEqual({ [ids[0]!]: gate });
  });

  it("undoes a rename and a creation", () => {
    const { room, gate } = table();
    const rename = room.run(gm, { type: "group.rename", groupId: gate, name: "North gate" });
    room.run(gm, { type: "history.undo", commandId: rename.commandId });
    expect(room.state.groups[gate]?.name).toBe("Gate guards");
    const create = room.run(gm, { type: "group.create", name: "Reinforcements" });
    room.run(gm, { type: "history.undo", commandId: create.commandId });
    expect(Object.values(room.state.groups).map((g) => g.name)).toEqual(["Gate guards", "Patrol"]);
  });

  it("refuses an undo that would clobber a newer change", () => {
    const { room, ids, gate, patrol } = table();
    const assign = room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] });
    room.run(gm, { type: "group.assign", groupId: patrol, tokenIds: [ids[0]!] });
    expect(room.attempt(gm, { type: "history.undo", commandId: assign.commandId })).toMatchObject({ ok: false });
    const rename = room.run(gm, { type: "group.rename", groupId: gate, name: "A" });
    room.run(gm, { type: "group.rename", groupId: gate, name: "B" });
    expect(room.attempt(gm, { type: "history.undo", commandId: rename.commandId })).toMatchObject({ ok: false });
  });

  it("undoes starting initiative, restoring the order and saved scores", () => {
    const { room, ids } = table();
    const before = { initiative: room.state.initiative, scores: ids.map((id) => room.state.tokens[id]!.initiative ?? null) };
    const { commandId } = room.run(gm, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 14 }, { tokenId: ids[1]!, score: 9 }] });
    expect(room.state.tokens[ids[0]!]!.initiative).toBe(14);
    room.run(gm, { type: "history.undo", commandId });
    expect(room.state.initiative).toEqual(before.initiative);
    expect(ids.map((id) => room.state.tokens[id]!.initiative ?? null)).toEqual(before.scores);
  });

  it("refuses to undo a start once the turn has advanced", () => {
    const { room, ids } = table();
    const { commandId } = room.run(gm, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 14 }, { tokenId: ids[1]!, score: 9 }] });
    room.run(gm, { type: "initiative.advance" });
    expect(room.attempt(gm, { type: "history.undo", commandId })).toMatchObject({
      ok: false, message: "Can't undo: the turn order has changed since the encounter started.",
    });
  });
});

describe("Players never see groups (KAN-82, FR-GM-23)", () => {
  it("strips groups and membership from a player's state", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: ids });
    const view = filterStateForViewer(room.state, alice);
    expect(view.groups).toEqual({});
    expect(view.tokenGroups).toEqual({});
    expect(JSON.stringify(view)).not.toContain("Gate guards");
    expect(filterStateForViewer(room.state, gm).groups[gate]?.name).toBe("Gate guards");
  });

  it("redacts every group event for players", () => {
    const { room, ids, gate } = table();
    room.run(gm, { type: "group.assign", groupId: gate, tokenIds: [ids[0]!] });
    room.run(gm, { type: "group.rename", groupId: gate, name: "North" });
    room.run(gm, { type: "group.delete", groupId: gate });
    const groupEvents = room.log.filter((c) => c.event.type.startsWith("Group") || c.event.type === "TokensGrouped");
    expect(groupEvents.length).toBeGreaterThanOrEqual(5);
    for (const committed of groupEvents) expect(filterEventForViewer(committed, room.state, alice).kind).toBe("redacted");
  });

  it("sends a player a resync, not the GM's order, when a start is undone", () => {
    const { room, ids } = table();
    const { commandId } = room.run(gm, { type: "initiative.start", entries: [{ tokenId: ids[2]!, score: 20 }] });
    room.run(gm, { type: "history.undo", commandId });
    const undone = room.log.find((c) => c.event.type === "InitiativeStartUndone")!;
    expect(filterEventForViewer(undone, room.state, alice)).toEqual({ kind: "resync" });
  });
});
