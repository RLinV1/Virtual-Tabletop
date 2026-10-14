// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { TokenRoster } from "../src/panels/TokenRoster";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };

const tok = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

const state: RoomState = {
  ...emptyRoomState("r1"),
  participants: { gm, alice },
  tokens: { g1: tok("g1", "Goblin"), f1: tok("f1", "Fighter", { ownerIds: ["alice"] }) },
};
const connection = { command: async () => ({ ok: true, seq: 1 }) } as unknown as RoomConnection;

afterEach(cleanup);

function show(you: Participant) {
  const onDuplicateToken = vi.fn();
  const onEditToken = vi.fn();
  render(
    <TokenRoster connection={connection} state={state} you={you} token="t" onFocusToken={() => {}} onPlaceToken={() => {}}
      onDuplicateToken={onDuplicateToken} editingTokenId={null} onEditToken={onEditToken} />,
  );
  return { onDuplicateToken, onEditToken };
}

describe("token list Duplicate and Edit (FR-GM-08, token-card-actions)", () => {
  it("gives the GM Duplicate and Edit on every row, each for that token", () => {
    const { onDuplicateToken, onEditToken } = show(gm);
    for (const name of ["Goblin", "Fighter"]) {
      expect(screen.getByRole("button", { name: `Duplicate ${name}` })).toBeTruthy();
      expect(screen.getByRole("button", { name: `Edit ${name}` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Goblin" }));
    expect(onDuplicateToken).toHaveBeenCalledWith("g1");
    fireEvent.click(screen.getByRole("button", { name: "Edit Goblin" }));
    expect(onEditToken).toHaveBeenCalledWith("g1");
  });

  it("gives a player Edit on their own token only, and never Duplicate", () => {
    show(alice);
    expect(screen.getByRole("button", { name: "Edit Fighter" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Goblin" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Duplicate/ })).toBeNull();
  });
});
