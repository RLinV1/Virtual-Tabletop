import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { CheckpointsPanel } from "../src/panels/CheckpointsPanel";
import { panelTabs } from "../src/panels/RoomPanel";

const connection = { command: async () => ({ ok: true }) } as unknown as RoomConnection;
const render = (state: RoomState) => renderToStaticMarkup(<CheckpointsPanel connection={connection} state={state} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the GM's Checkpoints section (KAN-41, FR-REC-02)", () => {
  it("offers a named save, and says when there is nothing to restore", () => {
    const html = render(emptyRoomState("r1"));
    expect(html).toContain("Checkpoint name");
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

  it("lives in the GM's Manage tab, which players never get", () => {
    expect(panelTabs(true).map((t) => t.id)).toContain("gm");
    expect(panelTabs(false).map((t) => t.id)).not.toContain("gm");
  });
});
