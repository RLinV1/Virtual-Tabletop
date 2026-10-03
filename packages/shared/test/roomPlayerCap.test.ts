import { describe, expect, it } from "vitest";
import {
  MAX_PLAYERS_PER_ROOM, activePlayerCount, decideJoin, emptyRoomState, reduceAll, type DomainEvent, type Participant, type RoomState,
} from "../src";
import { gm } from "./fixtures";

const player = (n: number): Participant => ({ id: `p-${n}`, role: "player", displayName: `Player ${n}` });
const newcomer = (displayName = "Newcomer"): Participant => ({ id: "p-new", role: "player", displayName });

/** A room with the GM and `players` active players, plus any extra events after them. */
function roomWith(players: number, ...after: DomainEvent[]): RoomState {
  return reduceAll(emptyRoomState("room-1"), [
    { type: "RoomCreated", name: "Big Table" },
    { type: "ParticipantJoined", participant: gm },
    ...Array.from({ length: players }, (_, i): DomainEvent => ({ type: "ParticipantJoined", participant: player(i + 1) })),
    ...after,
  ]);
}

describe("a room holds at most 32 players (room-player-cap, FR-PL-01)", () => {
  it("is 32", () => {
    expect(MAX_PLAYERS_PER_ROOM).toBe(32);
  });

  it("takes the 32nd player and refuses the 33rd, saying the room is full", () => {
    expect(decideJoin(roomWith(31), newcomer())).toMatchObject({ ok: true });
    const full = decideJoin(roomWith(32), newcomer());
    expect(full).toMatchObject({ ok: false, code: "invalid", reason: "room_full" });
    expect(!full.ok && full.message).toBe("This room is full: it holds 32 players. Ask the GM for a seat.");
  });

  it("does not count the GM", () => {
    const state = roomWith(31);
    expect(Object.keys(state.participants)).toHaveLength(32);
    expect(activePlayerCount(state)).toBe(31);
    expect(decideJoin(state, newcomer())).toMatchObject({ ok: true });
  });

  it("does not count a player who left or was removed", () => {
    const left = roomWith(32, { type: "ParticipantLeft", participant: player(1) });
    expect(activePlayerCount(left)).toBe(31);
    expect(decideJoin(left, newcomer())).toMatchObject({ ok: true });

    const removed = roomWith(32, { type: "ParticipantRevoked", participant: player(2) });
    expect(decideJoin(removed, newcomer())).toMatchObject({ ok: true });
  });

  it("keeps everyone in a room already over 32, and refuses new joins there", () => {
    const over = roomWith(40);
    expect(activePlayerCount(over)).toBe(40);
    expect(decideJoin(over, newcomer())).toMatchObject({ ok: false, reason: "room_full" });
  });

  it("still refuses a blank name as blank, and a full room as full whatever the name", () => {
    expect(decideJoin(roomWith(32), newcomer("   "))).toMatchObject({ ok: false, reason: "blank" });
    expect(decideJoin(roomWith(32), newcomer("player 1"))).toMatchObject({ ok: false, reason: "room_full" });
    expect(decideJoin(roomWith(31), newcomer("player 1"))).toMatchObject({ ok: false, reason: "name_taken" });
  });
});
