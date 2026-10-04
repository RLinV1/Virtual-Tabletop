import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, filterStateForViewer, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { previewConnection } from "../src/net/previewConnection";
import { PreviewBanner } from "../src/ui/PreviewBanner";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const aria: Participant = { id: "p1", role: "player", displayName: "Aria" };

function fakeConnection() {
  const sent = { command: vi.fn(async () => ({ ok: true as const })), ephemeral: vi.fn(), preview: vi.fn(), endPreview: vi.fn() };
  const connection = { ...sent, snapshot: { status: "open" }, onCommitted: () => () => {} } as unknown as RoomConnection;
  return { connection, sent };
}

describe("GM view as player (gm-view-as-player)", () => {
  it("refuses every command locally and names who is being previewed", async () => {
    const { connection, sent } = fakeConnection();
    const result = await previewConnection(connection, "Aria").command({ type: "chat.send", text: "hi" });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(result.ok ? "" : result.message).toContain("Aria");
    expect(sent.command).not.toHaveBeenCalled();
  });

  it("sends no pings, drags or aims while previewing", () => {
    const { connection, sent } = fakeConnection();
    const view = previewConnection(connection, "Aria");
    view.ephemeral({ type: "ping", at: { x: 1, y: 2 } });
    view.preview("drag:t", { type: "ping", at: { x: 1, y: 2 } });
    view.endPreview("drag:t", null);
    expect(sent.ephemeral).not.toHaveBeenCalled();
    expect(sent.preview).not.toHaveBeenCalled();
    expect(sent.endPreview).not.toHaveBeenCalled();
  });

  it("still reads through to the real connection", () => {
    const { connection } = fakeConnection();
    expect(previewConnection(connection, "Aria").snapshot.status).toBe("open");
  });

  it("shows the previewed player what the server would show them", () => {
    const base = emptyRoomState("r");
    const token = (id: string, hidden: boolean) => ({
      id, name: id, position: { x: 10, y: 10 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
      ownerIds: [], hidden, stats: { hp: 1, maxHp: 1, ac: null }, conditions: [],
    });
    const state: RoomState = { ...base, tokens: { a: token("a", false), b: token("b", true) } };
    expect(Object.keys(filterStateForViewer(state, aria).tokens)).toEqual(["a"]);
    expect(Object.keys(filterStateForViewer(state, gm).tokens)).toEqual(["a", "b"]);
  });

  it("names the player in the banner and offers the way back", () => {
    const html = renderToStaticMarkup(<PreviewBanner name="Aria" onExit={() => {}} />);
    expect(html).toContain("Viewing as <strong>Aria</strong>");
    expect(html).toContain("Back to GM view");
  });
});
