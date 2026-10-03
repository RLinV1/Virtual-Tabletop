import { describe, expect, it } from "vitest";
import {
  Command,
  decide,
  emptyRoomState,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  reduceCommitted,
  replayTo,
  tableOf,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, bob, gm } from "./fixtures";

/**
 * A room the way the server runs it: every command decided against the current state with the
 * last seq and a checkpoint table rebuilt from the log, then committed with seqs and one
 * command id per batch (ADR 0013, ADR 0019).
 */
function room() {
  let n = 0;
  const log: CommittedEvent[] = [];
  let state: RoomState = emptyRoomState("room-1");
  const commit = (events: DomainEvent[], actorId: string | null) => {
    const commandId = `cmd-${log.length + 1}`;
    for (const event of events) {
      const committed: CommittedEvent = { seq: log.length + 1, at: "2026-10-03T12:00:00.000Z", actorId, commandId, event };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
  };
  commit([{ type: "RoomCreated", name: "Keep" }, ...[gm, alice, bob].map((p) => ({ type: "ParticipantJoined" as const, participant: p }))], null);
  const decideNow = (actor: Participant, input: CommandInput) =>
    decide(state, actor, Command.parse(input), {
      newId: () => `id-${++n}`,
      random: () => 0.5,
      lastSeq: log.length,
      checkpointTable: (id) => {
        const checkpoint = state.checkpoints.find((c) => c.id === id);
        return checkpoint ? tableOf(replayTo(state.roomId, log, checkpoint.seq)) : null;
      },
    });
  return {
    get state() { return state; },
    log,
    attempt: decideNow,
    run(actor: Participant, input: CommandInput) {
      const decision = decideNow(actor, input);
      if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
      commit(decision.events, actor.id);
      return decision.events;
    },
  };
}

const tokenNamed = (state: RoomState, name: string) => Object.values(state.tokens).find((t) => t.name === name)!;

/** A room with a goblin, a hidden orc, a map, fog and a template, then a checkpoint "Start". */
function furnished() {
  const r = room();
  r.run(gm, { type: "scene.setMap", map: { url: "/uploads/a.png", width: 1000, height: 800 } });
  r.run(gm, { type: "token.create", name: "Goblin", position: { x: 35, y: 35 } });
  r.run(gm, { type: "token.create", name: "Orc", position: { x: 105, y: 35 }, hidden: true });
  r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 500, y: 500 }, to: { x: 700, y: 700 } } });
  r.run(alice, { type: "template.place", shape: "circle", origin: { x: 210, y: 210 }, toward: { x: 210, y: 210 }, size: 10 });
  r.run(gm, { type: "checkpoint.create", name: "  Start  " });
  return r;
}

describe("checkpoint commands (KAN-41, FR-REC-02)", () => {
  it("lets only the GM save or restore", () => {
    const r = furnished();
    const id = r.state.checkpoints[0]!.id;
    expect(r.attempt(alice, { type: "checkpoint.create", name: "Mine" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(r.attempt(alice, { type: "checkpoint.restore", checkpointId: id })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("needs a name of 1 to 60 characters, trimmed", () => {
    const r = furnished();
    expect(r.state.checkpoints[0]).toMatchObject({ name: "Start" });
    expect(r.attempt(gm, { type: "checkpoint.create", name: "   " })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt(gm, { type: "checkpoint.create", name: "x".repeat(61) })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt(gm, { type: "checkpoint.create", name: "x".repeat(60) }).ok).toBe(true);
  });

  it("records the last seq before it was saved", () => {
    const r = furnished();
    const created = r.log.at(-1)!;
    expect(created.event.type).toBe("CheckpointCreated");
    expect(r.state.checkpoints[0]!.seq).toBe(created.seq - 1);
  });

  it("refuses an unknown checkpoint, or one the server can't rebuild", () => {
    const r = furnished();
    expect(r.attempt(gm, { type: "checkpoint.restore", checkpointId: "nope" })).toMatchObject({ ok: false, code: "not_found" });
    const id = r.state.checkpoints[0]!.id;
    const noTable = decide(r.state, gm, Command.parse({ type: "checkpoint.restore", checkpointId: id }), { newId: () => "x" });
    expect(noTable).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("replayTo (ADR 0019)", () => {
  it("rebuilds the room exactly as it was after a seq", () => {
    const r = furnished();
    const at = r.log.length;
    const expected = r.state;
    r.run(gm, { type: "token.move", tokenId: tokenNamed(r.state, "Goblin").id, to: { x: 315, y: 315 } });
    r.run(gm, { type: "token.delete", tokenId: tokenNamed(r.state, "Orc").id });
    expect(replayTo("room-1", r.log, at)).toEqual(expected);
  });
});

describe("restoring a checkpoint (KAN-41, FR-REC-02)", () => {
  it("puts the whole board back and keeps the session's records", () => {
    const r = furnished();
    const startTable = tableOf(r.state);
    const goblin = tokenNamed(r.state, "Goblin").id;
    r.run(gm, { type: "token.move", tokenId: goblin, to: { x: 315, y: 315 } });
    r.run(gm, { type: "token.delete", tokenId: tokenNamed(r.state, "Orc").id });
    r.run(gm, { type: "token.create", name: "Troll", position: { x: 385, y: 35 } });
    r.run(gm, { type: "scene.setMap", map: { url: "/uploads/b.png", width: 2000, height: 1600 } });
    r.run(gm, { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 100, y: 100 } } });
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: goblin, score: 12 }] });
    r.run(alice, { type: "chat.send", text: "where did the orc go" });
    r.run(bob, { type: "dice.roll", expression: "1d20" });
    const { chat, rolls, participants, name } = r.state;

    r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });

    expect(tableOf(r.state)).toEqual(startTable);
    expect(r.state).toMatchObject({ chat, rolls, participants, name });
    expect(r.state.checkpoints).toHaveLength(1);
    expect(formatActivity(r.log.at(-1)!.event, "Mara", r.state)).toBe('Mara restored checkpoint "Start"');
  });

  it("carries the board it replaced, so it can be undone, and undo puts that board back", () => {
    const r = furnished();
    r.run(gm, { type: "token.move", tokenId: tokenNamed(r.state, "Goblin").id, to: { x: 315, y: 315 } });
    const beforeRestore = tableOf(r.state);
    const [restored] = r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });
    expect(restored).toMatchObject({ type: "CheckpointRestored", previous: beforeRestore });

    const commandId = r.log.at(-1)!.commandId!;
    expect(undoableAction(r.state.undo, commandId)).toBeTruthy();
    r.run(gm, { type: "history.undo", commandId });
    expect(tableOf(r.state)).toEqual(beforeRestore);
  });

  it("won't undo a restore once the board has changed since", () => {
    const r = furnished();
    r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });
    const commandId = r.log.at(-1)!.commandId!;
    r.run(gm, { type: "token.move", tokenId: tokenNamed(r.state, "Goblin").id, to: { x: 595, y: 35 } });
    expect(r.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("checkpoints stay with the GM (KAN-41, invariant 3)", () => {
  it("never shows players the checkpoint list", () => {
    const r = furnished();
    expect(filterStateForViewer(r.state, alice).checkpoints).toEqual([]);
    expect(JSON.stringify(filterStateForViewer(r.state, alice))).not.toContain("Start");
    expect(filterStateForViewer(r.state, gm).checkpoints).toHaveLength(1);
  });

  it("redacts a save and resyncs a restore for players, so no hidden token travels in an event", () => {
    const r = furnished();
    const save = r.log.at(-1)!;
    expect(filterEventForViewer(save, r.state, alice)).toEqual({ kind: "redacted", seq: save.seq });
    const before = r.state;
    r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });
    const restore = r.log.at(-1)!;
    expect(filterEventForViewer(restore, before, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(restore, before, gm)).toMatchObject({ kind: "event" });
    // The player's resync snapshot still withholds the hidden orc.
    expect(Object.values(filterStateForViewer(r.state, alice).tokens).map((t) => t.name)).toEqual(["Goblin"]);
  });
});

describe("undo across a restore (KAN-41, ADR 0019)", () => {
  it("drops board edits from before the restore, so none can undo across it", () => {
    const r = furnished();
    const goblin = tokenNamed(r.state, "Goblin").id;
    // Move away and back: the move's end square is also where the checkpoint has the goblin.
    r.run(gm, { type: "token.move", tokenId: goblin, to: { x: 315, y: 315 } });
    r.run(gm, { type: "token.move", tokenId: goblin, to: { x: 35, y: 35 } });
    const moveBack = r.log.at(-1)!.commandId!;
    expect(undoableAction(r.state.undo, moveBack)).toBeTruthy();

    r.run(gm, { type: "checkpoint.restore", checkpointId: r.state.checkpoints[0]!.id });
    expect(undoableAction(r.state.undo, moveBack)).toBeUndefined();
    // The restore itself stays undoable.
    expect(undoableAction(r.state.undo, r.log.at(-1)!.commandId!)).toBeTruthy();
  });
});
