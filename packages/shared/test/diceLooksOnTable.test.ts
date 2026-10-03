import { describe, expect, it } from "vitest";
import {
  Command,
  activityHistory,
  decide,
  filterEventForViewer,
  filterStateForViewer,
  reduceAll,
  reduceCommitted,
  undoableAction,
  type CommittedEvent,
  type DiceLookOnTable,
  type RoomState,
} from "../src";
import { alice, baseRoom, bob, ctx, gm } from "./fixtures";

const JUNGLE = "11111111-1111-4111-8111-111111111111";
const ICE = "22222222-2222-4222-8222-222222222222";
const look = (lookId: string, version = 1): DiceLookOnTable => ({
  lookId,
  version,
  faces: { d20: { url: "/uploads/jungle-d20.webp", width: 1536, height: 1024 } },
});

/** Decides as the server does: with the look the actor's account owns already read. */
function act(state: RoomState, actor = alice, input: unknown, owned: DiceLookOnTable | null = null) {
  return decide(state, state.participants[actor.id] ?? actor, Command.parse(input), { ...ctx, ownedDiceLook: owned });
}
function applied(state: RoomState, actor = alice, input: unknown, owned: DiceLookOnTable | null = null) {
  const d = act(state, actor, input, owned);
  if (!d.ok) throw new Error(d.message);
  return { state: reduceAll(state, d.events), events: d.events };
}

describe("dice looks on the table (shared-dice-looks, ADR 0018)", () => {
  it("puts the actor's own look on the table, carrying what it replaced", () => {
    const { state, events } = applied(baseRoom(), alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE));
    expect(events).toEqual([{ type: "ParticipantDiceLookSet", participantId: alice.id, look: look(JUNGLE), previous: null }]);
    expect(state.participants[alice.id]!.diceLook).toEqual(look(JUNGLE));

    const next = applied(state, alice, { type: "participant.setDiceLook", lookId: ICE }, look(ICE));
    expect(next.events[0]).toMatchObject({ look: look(ICE), previous: look(JUNGLE) });
  });

  it("refuses a look the actor's account does not own, including someone else's", () => {
    const withAlices = applied(baseRoom(), alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE)).state;
    // Bob asks for Alice's look: the server found no look of his under that id.
    expect(act(withAlices, bob, { type: "participant.setDiceLook", lookId: JUNGLE }, null)).toMatchObject({ ok: false, code: "forbidden" });
    // Or the server resolved a different look than the one named.
    expect(act(withAlices, bob, { type: "participant.setDiceLook", lookId: JUNGLE }, look(ICE))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("can't name another participant, and can't carry pictures from the client", () => {
    expect(Command.safeParse({ type: "participant.setDiceLook", lookId: JUNGLE, participantId: bob.id }).success).toBe(false);
    expect(Command.safeParse({ type: "participant.setDiceLook", lookId: JUNGLE, look: look(JUNGLE) }).success).toBe(false);
  });

  it("takes the look off with null, and changes nothing when there is nothing to change", () => {
    expect(act(baseRoom(), alice, { type: "participant.setDiceLook", lookId: null })).toEqual({ ok: true, events: [] });
    const on = applied(baseRoom(), alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE)).state;
    expect(act(on, alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE))).toEqual({ ok: true, events: [] });
    const off = applied(on, alice, { type: "participant.setDiceLook", lookId: null });
    expect(off.events[0]).toMatchObject({ look: null, previous: look(JUNGLE) });
    expect(off.state.participants[alice.id]!.diceLook).toBeNull();
  });

  it("puts an edited look back on the table: same look, newer version", () => {
    const on = applied(baseRoom(), alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE, 1)).state;
    expect(act(on, alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE, 2))).toMatchObject({
      ok: true, events: [{ look: look(JUNGLE, 2), previous: look(JUNGLE, 1) }],
    });
  });

  it("lets the GM put a player's dice back to classic, and nobody else", () => {
    const on = applied(baseRoom(), alice, { type: "participant.setDiceLook", lookId: JUNGLE }, look(JUNGLE)).state;
    const cleared = applied(on, gm, { type: "participant.clearDiceLook", participantId: alice.id });
    expect(cleared.events).toEqual([{ type: "ParticipantDiceLookSet", participantId: alice.id, look: null, previous: look(JUNGLE) }]);
    expect(act(on, bob, { type: "participant.clearDiceLook", participantId: alice.id })).toMatchObject({ ok: false, code: "forbidden" });
    expect(act(on, gm, { type: "participant.clearDiceLook", participantId: gm.id })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("is public: every viewer gets the look, with no name, owner or account", () => {
    const before = baseRoom();
    const event = { type: "ParticipantDiceLookSet", participantId: alice.id, look: look(JUNGLE), previous: null } as const;
    const committed: CommittedEvent = { seq: 9, at: "2026-10-03T00:00:00.000Z", actorId: alice.id, event };
    for (const viewer of [gm, alice, bob]) {
      expect(filterEventForViewer(committed, before, viewer)).toEqual({ kind: "event", committed });
    }
    const after = reduceCommitted(before, committed);
    expect(filterStateForViewer(after, bob).participants[alice.id]!.diceLook).toEqual(look(JUNGLE));
    expect(Object.keys(look(JUNGLE)).sort()).toEqual(["faces", "lookId", "version"]);
  });

  it("is not undoable and stays out of the activity log", () => {
    const committed: CommittedEvent = {
      seq: 3, at: "2026-10-03T00:00:00.000Z", actorId: alice.id, commandId: "33333333-3333-4333-8333-333333333333",
      event: { type: "ParticipantDiceLookSet", participantId: alice.id, look: look(JUNGLE), previous: null },
    };
    const state = reduceCommitted(baseRoom(), committed);
    expect(undoableAction(state.undo, committed.commandId!)).toBeUndefined();
    const at = committed.at;
    const log = activityHistory("room", [
      { seq: 1, at, actorId: gm.id, event: { type: "ParticipantJoined", participant: gm } },
      { seq: 2, at, actorId: alice.id, event: { type: "ParticipantJoined", participant: alice } },
      committed,
    ], gm, { player: "", limit: 50 });
    expect(log.entries.map((e) => e.committed.event.type)).toEqual(["ParticipantJoined", "ParticipantJoined"]);
  });

  it("replays an older log whose participants have no dice look", () => {
    expect(baseRoom().participants[alice.id]!.diceLook).toBeUndefined();
  });
});
