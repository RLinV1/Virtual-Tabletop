import { describe, expect, it } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { turnNoticeToken } from "../src/ui/TurnNotice";

const token = (id: string, name: string, ownerIds: string[]): Token => ({
  id, name, position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds, hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});

const player = { id: "p1", role: "player" } as Participant;
const gm = { id: "g1", role: "gm" } as Participant;

function withTurn(activeIndex: number): RoomState {
  const base = emptyRoomState("room");
  return {
    ...base,
    tokens: { aria: token("aria", "Aria", ["p1"]), goblin: token("goblin", "Goblin", []) },
    initiative: { order: ["goblin", "aria"], activeIndex, round: 1 },
  };
}

describe("turn notice (turn-notice)", () => {
  it("tells a player when their token's turn starts", () => {
    expect(turnNoticeToken("goblin", withTurn(1), player)).toEqual({ id: "aria", name: "Aria" });
  });

  it("says nothing when the turn goes to a token they don't own", () => {
    expect(turnNoticeToken("aria", withTurn(0), player)).toBeNull();
  });

  it("says nothing when the turn didn't change hands", () => {
    expect(turnNoticeToken("aria", withTurn(1), player)).toBeNull();
  });

  it("says nothing to the GM", () => {
    expect(turnNoticeToken("goblin", withTurn(1), gm)).toBeNull();
  });

  it("says nothing with no encounter running", () => {
    expect(turnNoticeToken("goblin", { ...withTurn(1), initiative: null }, player)).toBeNull();
  });
});
