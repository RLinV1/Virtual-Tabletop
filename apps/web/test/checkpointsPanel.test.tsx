// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, tableOf, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { CheckpointsPanel, summarizeTable } from "../src/panels/CheckpointsPanel";
import { panelTabs } from "../src/panels/RoomPanel";

const connection = { command: async () => ({ ok: true }) } as unknown as RoomConnection;
const render = (state: RoomState) => renderToStaticMarkup(<CheckpointsPanel connection={connection} state={state} token="t" />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the GM's Checkpoints section (KAN-41, FR-REC-02)", () => {
  it("offers a named save, and says when there is nothing to restore", () => {
    const html = render(emptyRoomState("r1"));
    expect(html).toContain("Checkpoint name");
    expect(html).toContain('placeholder="Checkpoint name"');
    expect(html).toContain(`maxLength="60"`);
    expect(text(html)).toContain("No checkpoints yet.");
  });

  it("lists checkpoints newest first, each with a Restore button named after it", () => {
    const html = render({
      ...emptyRoomState("r1"),
      checkpoints: [{ id: "c1", name: "Start", seq: 4 }, { id: "c2", name: "Before the ambush", seq: 9 }],
    });
    expect(html.indexOf("Before the ambush")).toBeLessThan(html.indexOf("Start"));
    expect(html).toContain('aria-label="Restore Start"');
    expect(html).toContain('aria-label="Restore Before the ambush"');
    expect(html).toContain('role="status"');
  });

  it("gives each checkpoint Preview and Delete buttons named after it (ADR 0036)", () => {
    const html = render({ ...emptyRoomState("r1"), checkpoints: [{ id: "c1", name: "Start", seq: 4 }] });
    expect(html).toContain('aria-label="Preview Start"');
    expect(html).toContain('aria-label="Delete Start"');
  });

  it("summarises a saved board with hidden tokens marked and the initiative order named", () => {
    const base = emptyRoomState("r1");
    const token = (id: string, name: string, hidden: boolean) =>
      ({ id, name, hidden, position: { x: 0, y: 0 } }) as unknown as RoomState["tokens"][string];
    const table = {
      ...tableOf(base),
      scene: { ...base.scene, map: { url: "/uploads/a.png", width: 1000, height: 800 } },
      tokens: { a: token("a", "Goblin", false), b: token("b", "Orc", true) },
      initiative: { order: ["b", "a"], activeIndex: 1, round: 2 },
    };
    expect(summarizeTable(table)).toEqual({
      map: "1000 × 800 px",
      tokens: [{ id: "a", name: "Goblin", hidden: false }, { id: "b", name: "Orc", hidden: true }],
      areas: 0,
      fog: 0,
      walls: 0,
      initiative: { round: 2, order: [{ id: "b", name: "Orc", active: false }, { id: "a", name: "Goblin", active: true }] },
    });
  });

  it("lives in the GM's Manage tab, which players never get", () => {
    expect(panelTabs(true).map((t) => t.id)).toContain("gm");
    expect(panelTabs(false).map((t) => t.id)).not.toContain("gm");
  });
});
