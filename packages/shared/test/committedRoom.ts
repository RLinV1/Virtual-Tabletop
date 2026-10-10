import {
  Command,
  decide,
  emptyRoomState,
  reduceCommitted,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, bob, gm } from "./fixtures";

/**
 * A room run the way the server runs it: seqs and one command id per batch, so undo groups
 * actions exactly as it does live (ADR 0013).
 */
export function committedRoom() {
  let n = 0;
  const log: CommittedEvent[] = [];
  let state: RoomState = emptyRoomState("room-1");
  const commit = (events: DomainEvent[], actorId: string | null) => {
    const commandId = `cmd-${log.length + 1}`;
    for (const event of events) {
      const committed: CommittedEvent = { seq: log.length + 1, at: "2026-10-09T12:00:00.000Z", actorId, commandId, event };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
    return commandId;
  };
  commit([{ type: "RoomCreated", name: "Keep" }, ...[gm, alice, bob].map((p) => ({ type: "ParticipantJoined" as const, participant: p }))], null);
  const attempt = (actor: Participant, input: CommandInput) =>
    decide(state, actor, Command.parse(input), { newId: () => `id-${++n}`, random: () => 0.5, lastSeq: log.length });
  return {
    get state() { return state; },
    log,
    attempt,
    /** Runs a command that must succeed; returns its events and command id. */
    run(actor: Participant, input: CommandInput) {
      const decision = attempt(actor, input);
      if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
      const commandId = commit(decision.events, actor.id);
      return { events: decision.events, commandId };
    },
  };
}
