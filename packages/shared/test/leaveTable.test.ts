import { describe, expect, it } from "vitest";
import { decideJoin, isActive, pendingDepartures, type CommandInput, type RoomState } from "../src";
import { alice, attempt, baseRoom, bob, gm, run, withToken } from "./fixtures";

/** Room where Alice owns Aria (with Bob), Wolf and a hidden Lantern, then leaves. */
function aliceLeft() {
  let s: RoomState = baseRoom();
  const aria = withToken(s, { name: "Aria", ownerIds: [alice.id, bob.id] });
  s = aria.state;
  const wolf = withToken(s, { name: "Wolf", ownerIds: [alice.id] });
  s = wolf.state;
  const lantern = withToken(s, { name: "Lantern", ownerIds: [alice.id], hidden: true });
  s = lantern.state;
  const before = s;
  const left = run(s, alice, { type: "participant.leave" });
  return { before, state: left.state, events: left.events, aria: aria.token, wolf: wolf.token, lantern: lantern.token };
}

const resolve = (
  participantId: string,
  actions: Extract<CommandInput, { type: "participant.resolveDeparture" }>["actions"],
): CommandInput => ({ type: "participant.resolveDeparture", participantId, actions });

describe("leaving the table (KAN-58)", () => {
  it("records the full participant and marks them left, keeping them in state", () => {
    const { state, events } = aliceLeft();
    expect(events).toEqual([{ type: "ParticipantLeft", participant: alice }]);
    expect(state.participants[alice.id]).toEqual({ ...alice, left: true });
    expect(isActive(state.participants[alice.id]!)).toBe(false);
  });

  it("does not change any token", () => {
    const { before, state } = aliceLeft();
    expect(state.tokens).toEqual(before.tokens);
  });

  it("rejects the GM leaving their own room", () => {
    expect(attempt(baseRoom(), gm, { type: "participant.leave" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("frees the display name for a new joiner", () => {
    const { state } = aliceLeft();
    expect(decideJoin(state, { id: "p-new", role: "player", displayName: "alice" })).toMatchObject({ ok: true });
  });

  it("refuses a departed participant as a token owner", () => {
    const { state, aria } = aliceLeft();
    expect(attempt(state, gm, { type: "token.setOwners", tokenId: aria.id, ownerIds: [alice.id] })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(
      attempt(state, gm, { type: "token.create", name: "X", position: { x: 0, y: 0 }, ownerIds: [alice.id] }),
    ).toMatchObject({ ok: false, code: "invalid" });
  });

  it("lists departed owners as pending, hidden tokens included", () => {
    const { before, state, aria, wolf, lantern } = aliceLeft();
    expect(pendingDepartures(before)).toEqual([]);
    expect(pendingDepartures(state)).toEqual([
      { participant: { ...alice, left: true }, tokenIds: [aria.id, wolf.id, lantern.id] },
    ]);
  });
});

describe("resolving a departure (KAN-58)", () => {
  it("Mixed resolution: reassign and delete in one decision, leaving the rest alone", () => {
    const { state, aria, wolf, lantern } = aliceLeft();
    const { state: next, events } = run(
      state,
      gm,
      resolve(alice.id, [
        { tokenId: aria.id, action: "reassign", to: bob.id },
        { tokenId: wolf.id, action: "delete" },
      ]),
    );
    expect(events).toEqual([
      // Bob already co-owned Aria, so he is not listed twice.
      { type: "TokenOwnersSet", tokenId: aria.id, ownerIds: [bob.id], previous: [alice.id, bob.id] },
      { type: "TokenDeleted", token: state.tokens[wolf.id] },
    ]);
    expect(next.tokens[wolf.id]).toBeUndefined();
    expect(next.tokens[lantern.id]!.ownerIds).toEqual([alice.id]);
    expect(pendingDepartures(next).map((d) => d.tokenIds)).toEqual([[lantern.id]]);
  });

  it("reassign puts the new player where the departed one was", () => {
    const { state: withAria, token } = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
    const s = run(withAria, alice, { type: "participant.leave" }).state;
    const { events } = run(s, gm, resolve(alice.id, [{ tokenId: token.id, action: "reassign", to: bob.id }]));
    expect(events).toEqual([{ type: "TokenOwnersSet", tokenId: token.id, ownerIds: [bob.id], previous: [alice.id] }]);
  });

  it("Co-owner kept: unassign removes only the departed player", () => {
    const { state, aria } = aliceLeft();
    const { state: next } = run(state, gm, resolve(alice.id, [{ tokenId: aria.id, action: "unassign" }]));
    expect(next.tokens[aria.id]!.ownerIds).toEqual([bob.id]);
  });

  it("clears the pending departure once every token is resolved", () => {
    const { state, aria, wolf, lantern } = aliceLeft();
    const actions = [aria, wolf, lantern].map((t) => ({ tokenId: t.id, action: "unassign" as const }));
    expect(pendingDepartures(run(state, gm, resolve(alice.id, actions)).state)).toEqual([]);
  });

  it("Invalid target rejects everything: a reassignment to someone who also left", () => {
    const { state, aria, wolf } = aliceLeft();
    const bobLeft = run(state, bob, { type: "participant.leave" }).state;
    const d = attempt(
      bobLeft,
      gm,
      resolve(alice.id, [
        { tokenId: wolf.id, action: "delete" },
        { tokenId: aria.id, action: "reassign", to: bob.id },
      ]),
    );
    expect(d).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects the GM as a target, unknown targets, duplicate tokens and tokens the player didn't own", () => {
    const { state, aria } = aliceLeft();
    const tryIt = (actions: Parameters<typeof resolve>[1], s = state) => attempt(s, gm, resolve(alice.id, actions));
    expect(tryIt([{ tokenId: aria.id, action: "reassign", to: gm.id }])).toMatchObject({ ok: false, code: "invalid" });
    expect(tryIt([{ tokenId: aria.id, action: "reassign", to: "p-nobody" }])).toMatchObject({ ok: false, code: "not_found" });
    expect(
      tryIt([
        { tokenId: aria.id, action: "delete" },
        { tokenId: aria.id, action: "unassign" },
      ]),
    ).toMatchObject({ ok: false, code: "invalid" });
    expect(tryIt([{ tokenId: "missing", action: "delete" }])).toMatchObject({ ok: false, code: "not_found" });
    const unowned = withToken(state, { name: "Goblin" });
    expect(tryIt([{ tokenId: unowned.token.id, action: "delete" }], unowned.state)).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("rejects resolving a participant who is still in the room", () => {
    const { state, token } = withToken(baseRoom(), { ownerIds: [alice.id] });
    expect(attempt(state, gm, resolve(alice.id, [{ tokenId: token.id, action: "delete" }]))).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("Player cannot resolve", () => {
    const { state, aria } = aliceLeft();
    expect(attempt(state, bob, resolve(alice.id, [{ tokenId: aria.id, action: "delete" }]))).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });
});
