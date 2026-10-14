import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type RoomState, type Verdict } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { DicePanel, type RollThrow } from "../src/panels/DicePanel";

const connection = { command: async () => ({ ok: true }) } as unknown as RoomConnection;
const rollThrow: RollThrow = {
  airborne: new Set(),
  rolling: false,
  justLandedId: null,
  onLanded: () => {},
  expectDrop: () => () => {},
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** A room where Aria's owner rolled 16 to hit Goblin, ruled as given. */
function withAttack(verdict?: Verdict): RoomState {
  const state = emptyRoomState("r1");
  return {
    ...state,
    participants: {
      gm: { id: "gm", role: "gm", displayName: "Mara" },
      p1: { id: "p1", role: "player", displayName: "Aria" },
    },
    rolls: [
      {
        id: "roll1",
        expression: "1d20+5",
        byParticipantId: "p1",
        dice: [11],
        modifier: 5,
        total: 16,
        visibility: "public",
        attack: {
          actor: { tokenId: "t1", name: "Aria", hidden: false },
          target: { tokenId: "t2", name: "Goblin", hidden: false },
          label: "Longsword",
          kind: "toHit",
        },
        ...(verdict ? { verdict } : {}),
      },
    ],
  };
}

const render = (state: RoomState) =>
  renderToStaticMarkup(<DicePanel connection={connection} state={state} isGm rollThrow={rollThrow} />);

describe("the Dice tab leaves rulings to the Play tab (FR-TAC-09, rulings-play-tab-only)", () => {
  it("offers the GM no Hit or Miss on a to-hit roll waiting for a ruling", () => {
    const html = render(withAttack());
    expect(text(html)).toContain("Aria → Goblin · Longsword · 1d20+5 = 16");
    expect(html).not.toMatch(/>\s*(Hit|Miss)\s*</);
    expect(html).not.toContain('aria-label="Ruling"');
  });

  it("still shows a ruled roll's verdict in its title, with no controls", () => {
    const html = render(withAttack("hit"));
    expect(text(html)).toContain("= 16 · Hit");
    expect(html).not.toMatch(/<button[^>]*>\s*(Hit|Miss)\s*</);
    expect(html).not.toContain("aria-pressed");
  });
});
