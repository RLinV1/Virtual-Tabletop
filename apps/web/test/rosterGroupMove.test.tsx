// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { TokenRoster } from "../src/panels/TokenRoster";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };

const tok = (id: string, name: string): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});

function room(): RoomState {
  return {
    ...emptyRoomState("r1"),
    participants: { gm, alice },
    tokens: { g1: tok("g1", "Goblin"), g2: tok("g2", "Goblin 2"), c1: tok("c1", "Cultist") },
    groups: { gate: { id: "gate", name: "Gate guards" }, patrol: { id: "patrol", name: "Patrol" }, back: { id: "back", name: "Back room" } },
    tokenGroups: { g1: "gate", g2: "gate" },
  };
}

afterEach(cleanup);

function show(state: RoomState, you: Participant = gm) {
  const command = vi.fn(async () => ({ ok: true as const, seq: 1 }));
  const connection = { command } as unknown as RoomConnection;
  const el = (s: RoomState) => (
    <TokenRoster connection={connection} state={s} you={you} token="t" onFocusToken={() => {}} onPlaceToken={() => {}}
      onDuplicateToken={() => {}} editingTokenId={null} onEditToken={() => {}} />
  );
  const view = render(el(state));
  return { command, rerender: (s: RoomState) => view.rerender(el(s)) };
}

const section = (name: string) => screen.getByRole("region", { name });
const stubTransfer = () => ({ effectAllowed: "", dropEffect: "", setData: () => {} });

describe("moving a token between groups from the roster (FR-GM-08, KAN-82)", () => {
  it("lists groups in creation order, then Ungrouped, with the current group marked and not selectable", () => {
    show(room());
    fireEvent.click(screen.getByRole("button", { name: "Move Goblin 2 to group" }));
    const menu = screen.getByRole("dialog", { name: "Move Goblin 2 to" });
    const items = within(menu).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toEqual(["Gate guards", "Patrol", "Back room", "Ungrouped"]);
    expect(items[0]).toHaveProperty("disabled", true);
    expect(items[0]?.getAttribute("aria-current")).toBe("true");
    expect(items[1]).toHaveProperty("disabled", false);
  });

  it("sends one group.assign for the token and closes the menu", async () => {
    const { command } = show(room());
    fireEvent.click(screen.getByRole("button", { name: "Move Goblin 2 to group" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Patrol" })));
    expect(command).toHaveBeenCalledWith({ type: "group.assign", groupId: "patrol", tokenIds: ["g2"] });
    expect(screen.queryByRole("dialog", { name: "Move Goblin 2 to" })).toBeNull();
  });

  it("takes a token out of its group with Ungrouped", async () => {
    const { command } = show(room());
    fireEvent.click(screen.getByRole("button", { name: "Move Goblin to group" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ungrouped" })));
    expect(command).toHaveBeenCalledWith({ type: "group.assign", groupId: null, tokenIds: ["g1"] });
  });

  it("gives focus back to the moved token's grip in its new group, or to a collapsed group's heading", async () => {
    const state = room();
    const { rerender } = show(state);
    fireEvent.click(screen.getByRole("button", { name: "Move Goblin 2 to group" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Patrol" })));
    rerender({ ...state, tokenGroups: { ...state.tokenGroups, g2: "patrol" } });
    expect(document.activeElement).toBe(within(section("Patrol")).getByRole("button", { name: "Move Goblin 2 to group" }));

    // Collapse Back room, then move Cultist there.
    fireEvent.click(within(section("Back room")).getByRole("button", { name: /Back room/, expanded: true }));
    fireEvent.click(screen.getByRole("button", { name: "Move Cultist to group" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Back room" })));
    rerender({ ...state, tokenGroups: { ...state.tokenGroups, g2: "patrol", c1: "back" } });
    expect(document.activeElement).toBe(within(section("Back room")).getByRole("button", { name: /Back room/, expanded: false }));
  });

  it("shows no grip when the room has no groups, and none to a player", () => {
    show({ ...room(), groups: {}, tokenGroups: {} });
    expect(screen.queryByRole("button", { name: /^Move .* to group$/ })).toBeNull();
    cleanup();
    show({ ...room(), groups: {}, tokenGroups: {} }, alice);
    expect(screen.queryByRole("button", { name: /^Move .* to group$/ })).toBeNull();
  });
});

describe("dragging a token onto a group (FR-GM-08, KAN-82)", () => {
  it("moves the token to the group it's dropped on, highlighting the group while over it", async () => {
    const { command } = show(room());
    const grip = screen.getByRole("button", { name: "Move Cultist to group" });
    const target = section("Back room");
    fireEvent.dragStart(grip, { dataTransfer: stubTransfer() });
    fireEvent.dragOver(target, { dataTransfer: stubTransfer() });
    expect(target.className).toContain("drop-target");
    await act(async () => fireEvent.drop(target, { dataTransfer: stubTransfer() }));
    expect(command).toHaveBeenCalledWith({ type: "group.assign", groupId: "back", tokenIds: ["c1"] });
    expect(target.className).not.toContain("drop-target");
  });

  it("sends nothing when dropped on its own group", async () => {
    const { command } = show(room());
    fireEvent.dragStart(screen.getByRole("button", { name: "Move Goblin to group" }), { dataTransfer: stubTransfer() });
    fireEvent.dragOver(section("Gate guards"), { dataTransfer: stubTransfer() });
    await act(async () => fireEvent.drop(section("Gate guards"), { dataTransfer: stubTransfer() }));
    expect(command).not.toHaveBeenCalled();
  });

  it("accepts a drop on a collapsed group's heading", async () => {
    const { command } = show(room());
    const patrol = section("Patrol");
    fireEvent.click(within(patrol).getByRole("button", { name: /Patrol/, expanded: true }));
    fireEvent.dragStart(screen.getByRole("button", { name: "Move Goblin to group" }), { dataTransfer: stubTransfer() });
    const heading = within(patrol).getByRole("button", { name: /Patrol/, expanded: false });
    fireEvent.dragOver(heading, { dataTransfer: stubTransfer() });
    await act(async () => fireEvent.drop(heading, { dataTransfer: stubTransfer() }));
    expect(command).toHaveBeenCalledWith({ type: "group.assign", groupId: "patrol", tokenIds: ["g1"] });
  });

  it("clears the highlight when the drag ends without a drop", () => {
    show(room());
    const grip = screen.getByRole("button", { name: "Move Cultist to group" });
    fireEvent.dragStart(grip, { dataTransfer: stubTransfer() });
    fireEvent.dragOver(section("Patrol"), { dataTransfer: stubTransfer() });
    expect(section("Patrol").className).toContain("drop-target");
    fireEvent.dragEnd(grip, { dataTransfer: stubTransfer() });
    expect(section("Patrol").className).not.toContain("drop-target");
  });

  it("offers an empty Ungrouped section as a target while dragging", async () => {
    const state = { ...room(), tokenGroups: { g1: "gate", g2: "gate", c1: "back" } };
    const { command } = show(state);
    expect(screen.queryByRole("region", { name: "Ungrouped tokens" })).toBeNull();
    fireEvent.dragStart(screen.getByRole("button", { name: "Move Cultist to group" }), { dataTransfer: stubTransfer() });
    const ungrouped = section("Ungrouped tokens");
    fireEvent.dragOver(ungrouped, { dataTransfer: stubTransfer() });
    await act(async () => fireEvent.drop(ungrouped, { dataTransfer: stubTransfer() }));
    expect(command).toHaveBeenCalledWith({ type: "group.assign", groupId: null, tokenIds: ["c1"] });
  });
});
