import {
  Command,
  decide,
  emptyRoomState,
  reduceAll,
  type CommandInput,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";

export const gm: Participant = { id: "p-gm", role: "gm", displayName: "GM" };
export const alice: Participant = { id: "p-alice", role: "player", displayName: "Alice" };
export const bob: Participant = { id: "p-bob", role: "player", displayName: "Bob" };

export function baseRoom(): RoomState {
  const events: DomainEvent[] = [
    { type: "RoomCreated", name: "Test Room" },
    { type: "ParticipantJoined", participant: gm },
    { type: "ParticipantJoined", participant: alice },
    { type: "ParticipantJoined", participant: bob },
  ];
  return reduceAll(emptyRoomState("room-1"), events);
}

let n = 0;
export const ctx = { newId: () => `id-${++n}` };

/** Parse like the server does (applies defaults), then decide + apply. */
export function run(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  return { state: reduceAll(state, decision.events), events: decision.events };
}
