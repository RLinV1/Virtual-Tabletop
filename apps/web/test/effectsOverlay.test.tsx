import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type RoomState, type Token } from "@vtt/shared";
import EffectsOverlay, { type OverlayEffect } from "../src/board/EffectsOverlay";

const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 140, y: 140 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});

const room = (tokens: Token[]): RoomState => ({
  ...emptyRoomState("r"),
  tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
});

const render = (state: RoomState, effects: OverlayEffect[] = [], isGm = false) =>
  renderToStaticMarkup(<EffectsOverlay state={state} effects={effects} subscribe={() => () => {}} onDone={() => {}} isGm={isGm} />);

describe("effects overlay (board-effects-overlay)", () => {
  it("is hidden from assistive technology and styled as input-transparent", () => {
    const html = render(room([token("a")]));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="effects-overlay"');
    expect(html).not.toContain("tabindex");
  });

  it("draws a ring for a ring condition", () => {
    const html = render(room([token("a", { conditions: ["concentrating"] })]));
    expect(html).toContain("effects-ring");
  });

  it("draws a ring for prone too", () => {
    expect(render(room([token("a", { conditions: ["prone"] })]))).toContain("effects-ring");
  });

  it("draws nothing for a condition-free board", () => {
    const html = render(room([token("a")]));
    expect(html).not.toContain("effects-ring");
    expect(html).not.toContain("effects-label");
  });

  it("shows the damage number on a visible target", () => {
    const html = render(room([token("b")]), [{ id: 1, effect: { kind: "damage", tokenId: "b", amount: 7 } }]);
    expect(html).toContain("−7");
  });

  it("draws no effect for a token hidden from a player, but does for the GM", () => {
    const state = room([token("b", { hidden: true, conditions: ["concentrating"] })]);
    const effects: OverlayEffect[] = [{ id: 1, effect: { kind: "hit", tokenId: "b" } }];
    const player = render(state, effects, false);
    expect(player).not.toContain("effects-ring");
    expect(player).not.toContain("effects-orb");
    expect(render(state, effects, true)).toContain("effects-orb");
  });

  it("draws nothing for a token missing from the viewer's state", () => {
    const html = render(room([token("a")]), [{ id: 1, effect: { kind: "damage", tokenId: "ghost", amount: 3 } }]);
    expect(html).not.toContain("−3");
  });

  it("draws a strike only when both ends are visible", () => {
    const state = room([token("a", { hidden: true }), token("b")]);
    const strike: OverlayEffect[] = [{ id: 1, effect: { kind: "strike", fromId: "a", toId: "b" } }];
    expect(render(state, strike, false)).not.toContain("effects-orb");
    expect(render(state, strike, true)).toContain("effects-orb");
  });
});
