// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel } from "../src/panels/AttackPanel";

afterEach(cleanup);

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});
const state: RoomState = {
  ...emptyRoomState("r"),
  participants: { gm },
  tokens: {
    a: token("a", { attacks: [{ name: "Slash", toHit: { count: 1, sides: 20, modifier: 0 }, damage: null }] }),
    b: token("b"),
  },
};

function renderPanel() {
  const command = vi.fn(async (_command: unknown) => ({ ok: true as const, seq: null }));
  const connection = { command, ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
  render(
    <AttackPanel
      connection={connection} state={state} you={gm} pick={{ attackerId: "a", targetId: "b" }} onPick={() => {}}
      reset={{ count: 0, clearedRollId: null }} airborne={new Set()} rolling={false} onLanded={() => {}}
      onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
    />,
  );
  return command;
}

describe("Attack style picker (FR-TAC-09, ADR 0038)", () => {
  it("offers melee, ranged and magic with none selected", () => {
    renderPanel();
    const group = screen.getByRole("group", { name: "Attack style" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Melee", "Ranged", "Magic"]);
    expect(buttons.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("sends no style when none is chosen", async () => {
    const command = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Roll Slash/ }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    const sent = command.mock.calls[0]![0] as { attack: object };
    expect(sent.attack).not.toHaveProperty("style");
  });

  it("sends the chosen style on the roll", async () => {
    const command = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Magic" }));
    fireEvent.click(screen.getByRole("button", { name: /Roll Slash/ }));
    await waitFor(() => expect(command).toHaveBeenCalled());
    expect(command.mock.calls[0]![0]).toMatchObject({ type: "dice.roll", attack: { actorTokenId: "a", targetTokenId: "b", style: "magic" } });
  });
});
