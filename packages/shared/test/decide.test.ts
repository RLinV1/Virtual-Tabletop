import { describe, expect, it } from "vitest";
import { Command, decide, decideJoin, isActive, isDisplayNameTaken, normalizeDisplayName, type Participant } from "../src";
import { alice, attempt, baseRoom, bob, ctx, gm, run } from "./fixtures";

describe("authorization (FR-GM-15, FR-PL-04)", () => {
  const withToken = () =>
    run(baseRoom(), gm, {
      type: "token.create",
      name: "Alice's fighter",
      position: { x: 35, y: 35 },
      ownerIds: [alice.id],
    });

  it("lets the owner move their token", () => {
    const { state, events } = withToken();
    const token = Object.values(state.tokens)[0]!;
    expect(events).toHaveLength(1);
    const moved = run(state, alice, { type: "token.move", tokenId: token.id, to: { x: 105, y: 35 } });
    expect(moved.state.tokens[token.id]!.position).toEqual({ x: 105, y: 35 });
    expect(moved.events[0]).toMatchObject({ type: "TokenMoved", from: { x: 35, y: 35 } });
  });

  it("forbids a non-owner from moving a token", () => {
    const { state } = withToken();
    const token = Object.values(state.tokens)[0]!;
    const d = decide(state, bob, Command.parse({ type: "token.move", tokenId: token.id, to: { x: 0, y: 0 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("forbids players from GM-only commands", () => {
    const d = decide(baseRoom(), alice, Command.parse({ type: "token.create", name: "x", position: { x: 0, y: 0 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers not_found (not forbidden) for hidden tokens, so rejections don't leak them", () => {
    const { state } = run(baseRoom(), gm, {
      type: "token.create", name: "Ambusher", position: { x: 0, y: 0 }, hidden: true,
    });
    const token = Object.values(state.tokens)[0]!;
    const d = decide(state, alice, Command.parse({ type: "token.move", tokenId: token.id, to: { x: 1, y: 1 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("display name uniqueness (KAN-61)", () => {
  const newcomer = (displayName: string): Participant => ({ id: "p-new", role: "player", displayName });

  it("treats case and surrounding whitespace as the same name", () => {
    const state = baseRoom();
    for (const name of ["alice", "Alice ", "  ALICE"]) expect(isDisplayNameTaken(state, name)).toBe(true);
    expect(normalizeDisplayName(" AlIce ")).toBe("alice");
    expect(isDisplayNameTaken(state, "Alicia")).toBe(false);
  });

  it("ignores the participant named by exceptId", () => {
    expect(isDisplayNameTaken(baseRoom(), "alice", alice.id)).toBe(false);
  });

  it("counts a participant as active until they leave (KAN-58)", () => {
    expect(isActive(alice)).toBe(true);
    expect(isActive({ ...alice, left: true })).toBe(false);
  });

  it("accepts a join and stores the trimmed name", () => {
    const d = decideJoin(baseRoom(), newcomer("  Raymond  "));
    expect(d).toEqual({
      ok: true,
      events: [{ type: "ParticipantJoined", participant: { id: "p-new", role: "player", displayName: "Raymond" } }],
    });
  });

  it("rejects a join with a name already in use, ignoring case", () => {
    const d = decideJoin(baseRoom(), newcomer("bob "));
    expect(d).toMatchObject({ ok: false, code: "invalid", reason: "name_taken" });
    expect(!d.ok && d.message).toContain("already taken");
  });

  it("rejects a blank join name", () => {
    expect(decideJoin(baseRoom(), newcomer("   "))).toMatchObject({ ok: false, reason: "blank" });
  });

  it("rejects a rename to another participant's name and emits nothing", () => {
    const d = attempt(baseRoom(), bob, { type: "participant.rename", displayName: "ALICE" });
    expect(d).toMatchObject({ ok: false, code: "invalid" });
    expect(!d.ok && d.message).toContain("already taken");
  });

  it("allows changing the case of your own name", () => {
    const { state, events } = run(baseRoom(), alice, { type: "participant.rename", displayName: " ALICE " });
    expect(events).toEqual([
      { type: "ParticipantRenamed", participantId: alice.id, displayName: "ALICE", previous: "Alice" },
    ]);
    expect(state.participants[alice.id]!.displayName).toBe("ALICE");
  });

  it("rejects a blank rename", () => {
    expect(attempt(baseRoom(), alice, { type: "participant.rename", displayName: "  " })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });
});
