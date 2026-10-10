import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { FogPanel } from "../src/panels/FogPanel";

const connection = { command: async () => ({ ok: true }) } as unknown as RoomConnection;

function room(overrides: Partial<RoomState> = {}): RoomState {
  const base = emptyRoomState("r1");
  return { ...base, scene: { ...base.scene, map: { url: "/uploads/map.png", width: 700, height: 350 } }, ...overrides };
}

const render = (state: RoomState) => renderToStaticMarkup(<FogPanel connection={connection} state={state} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("fog of war by keyboard: the GM's Fog section (FR-GM-17)", () => {
  it("asks for a map before offering fog", () => {
    const base = emptyRoomState("r1");
    const html = render(base);
    expect(text(html)).toContain("Set a battle map to use fog.");
    expect(html).not.toContain("Fog whole map");
  });

  it("offers fogging the whole map, and no block-of-cells form", () => {
    const html = render(room());
    expect(html).toContain("Fog whole map");
    expect(html).not.toContain("From column");
    expect(text(html)).toContain("No fog on the map.");
  });

  it("lists each fogged region by its cells, with a Reveal button named after it", () => {
    const html = render(room({
      fog: {
        f1: { id: "f1", shape: "rect", points: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 350 }, { x: 0, y: 350 }] },
        f2: { id: "f2", shape: "rect", points: [{ x: 70, y: 70 }, { x: 210, y: 70 }, { x: 210, y: 280 }, { x: 70, y: 280 }] },
        f3: { id: "f3", shape: "polygon", points: [{ x: 100, y: 10 }, { x: 300, y: 10 }, { x: 200, y: 200 }] },
      },
    }));
    expect(text(html)).toContain("3 fogged regions");
    expect(html).toContain('aria-label="Reveal Whole map"');
    expect(html).toContain('aria-label="Reveal Rectangle · columns 2–3, rows 2–4"');
    expect(html).toContain('aria-label="Reveal Polygon, 3 corners · columns 2–5, rows 1–3"');
    // Results are announced to screen readers.
    expect(html).toContain('role="status"');
  });
});
