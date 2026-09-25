import { describe, expect, it } from "vitest";
import {
  DomainEvent,
  activityHistory,
  decideJoin,
  endReason,
  filterEventForViewer,
  inactiveLabel,
  isActive,
  pendingDepartures,
  type CommittedEvent,
} from "../src";
import { alice, attempt, baseRoom, bob, gm, run, withToken } from "./fixtures";

/** Alice owns Rogue alone and shares Wolf with Bob; then the GM removes her. */
function aliceRevoked() {
  const rogue = withToken(baseRoom(), { name: "Rogue", ownerIds: [alice.id] });
  const wolf = withToken(rogue.state, { name: "Wolf", ownerIds: [alice.id, bob.id] });
  const before = wolf.state;
  const revoked = run(before, gm, { type: "participant.revoke", participantId: alice.id });
  return { before, state: revoked.state, events: revoked.events, rogue: rogue.token, wolf: wolf.token };
}

describe("guest revocation (FR-GM-20)", () => {
  it("records the whole participant, sets only the flag and changes no token", () => {
    const { before, state, events } = aliceRevoked();
    expect(events).toEqual([{ type: "ParticipantRevoked", participant: alice }]);
    expect(state.participants[alice.id]).toEqual({ ...alice, revoked: true });
    expect(state.tokens).toEqual(before.tokens);
  });

  it("makes the participant inactive, labelled as removed", () => {
    const revoked = aliceRevoked().state.participants[alice.id]!;
    expect(isActive(revoked)).toBe(false);
    expect(inactiveLabel(revoked)).toBe("removed");
    expect(endReason(revoked)).toBe("revoked");
    expect(inactiveLabel({ ...bob, left: true })).toBe("left");
    expect(endReason(bob)).toBeNull();
  });

  it("is forbidden to players", () => {
    expect(attempt(baseRoom(), bob, { type: "participant.revoke", participantId: alice.id })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("is invalid for the GM themselves, a revoked target and a target who left", () => {
    const { state } = aliceRevoked();
    const bobLeft = run(state, bob, { type: "participant.leave" }).state;
    for (const participantId of [gm.id, alice.id, bob.id]) {
      expect(attempt(bobLeft, gm, { type: "participant.revoke", participantId })).toMatchObject({
        ok: false,
        code: "invalid",
      });
    }
  });

  it("is invalid for another GM", () => {
    const withCoGm = run(baseRoom(), gm, { type: "token.create", name: "x", position: { x: 0, y: 0 } }).state;
    const coGm = { id: "p-gm2", role: "gm" as const, displayName: "Co-GM" };
    const state = { ...withCoGm, participants: { ...withCoGm.participants, [coGm.id]: coGm } };
    expect(attempt(state, gm, { type: "participant.revoke", participantId: coGm.id })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("is not_found for an unknown participant", () => {
    expect(attempt(baseRoom(), gm, { type: "participant.revoke", participantId: "p-nobody" })).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("frees the display name for a new joiner", () => {
    expect(decideJoin(aliceRevoked().state, { id: "p-new", role: "player", displayName: "Alice" })).toMatchObject({
      ok: true,
    });
  });

  it("lists the revoked owner's tokens for the GM's review, and the review accepts them", () => {
    const { state, rogue, wolf } = aliceRevoked();
    expect(pendingDepartures(state)).toEqual([
      { participant: { ...alice, revoked: true }, tokenIds: [rogue.id, wolf.id] },
    ]);
    const { state: next } = run(state, gm, {
      type: "participant.resolveDeparture",
      participantId: alice.id,
      actions: [
        { tokenId: rogue.id, action: "reassign", to: bob.id },
        { tokenId: wolf.id, action: "unassign" },
      ],
    });
    expect(next.tokens[rogue.id]!.ownerIds).toEqual([bob.id]);
    expect(next.tokens[wolf.id]!.ownerIds).toEqual([bob.id]);
    expect(pendingDepartures(next)).toEqual([]);
  });

  it("lets a co-owner and the GM still move the revoked player's tokens", () => {
    const { state, rogue, wolf } = aliceRevoked();
    expect(attempt(state, bob, { type: "token.move", tokenId: wolf.id, to: { x: 1, y: 1 } })).toMatchObject({ ok: true });
    expect(attempt(state, gm, { type: "token.move", tokenId: rogue.id, to: { x: 1, y: 1 } })).toMatchObject({ ok: true });
  });

  it("refuses a revoked participant as a token owner", () => {
    const { state, rogue } = aliceRevoked();
    expect(attempt(state, gm, { type: "token.setOwners", tokenId: rogue.id, ownerIds: [alice.id] })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("passes ParticipantRevoked to players", () => {
    const committed: CommittedEvent = {
      seq: 7, at: new Date(0).toISOString(), actorId: gm.id, event: { type: "ParticipantRevoked", participant: alice },
    };
    expect(filterEventForViewer(committed, baseRoom(), bob)).toEqual({ kind: "event", committed });
  });

  it("parses an old participant with neither flag", () => {
    expect(DomainEvent.safeParse({ type: "ParticipantJoined", participant: { id: "p", role: "player", displayName: "Old" } }).success).toBe(true);
  });

  it("keeps the revoked player's name on earlier history entries", () => {
    const { token } = withToken(baseRoom(), { name: "Rogue", ownerIds: [alice.id] });
    const at = "2026-09-25T12:00:00.000Z";
    const log: CommittedEvent[] = [
      { seq: 1, at, actorId: null, event: { type: "RoomCreated", name: "Room" } },
      { seq: 2, at, actorId: gm.id, event: { type: "ParticipantJoined", participant: gm } },
      { seq: 3, at, actorId: alice.id, event: { type: "ParticipantJoined", participant: alice } },
      { seq: 4, at, actorId: gm.id, event: { type: "TokenCreated", token } },
      { seq: 5, at, actorId: alice.id, event: { type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 1, y: 2 } } },
      { seq: 6, at, actorId: gm.id, event: { type: "ParticipantRevoked", participant: alice } },
    ];
    const sentences = activityHistory("room-1", log, gm, { limit: 50, player: "" }).entries.map((e) => e.sentence);
    expect(sentences[0]).toBe("GM removed Alice from the room");
    expect(sentences[1]).toMatch(/^Alice moved Rogue/);
  });
});
