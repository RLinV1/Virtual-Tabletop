import { describe, expect, it } from "vitest";
import { Command, decide } from "../src";
import { alice, baseRoom, bob, ctx, gm, run } from "./fixtures";

describe("authorization (FR-GM-15, FR-PL-04)", () => {
  const withToken = () =>
    run(baseRoom(), gm, {
      type: "token.create",
      name: "Alice's fighter",
      position: { x: 35, y: 35 },
      ownerIds: [alice.id],
    });

  it("lets the owner move their token", () => {
    const { state, events } = withToken();
    const token = Object.values(state.tokens)[0]!;
    expect(events).toHaveLength(1);
    const moved = run(state, alice, { type: "token.move", tokenId: token.id, to: { x: 105, y: 35 } });
    expect(moved.state.tokens[token.id]!.position).toEqual({ x: 105, y: 35 });
    expect(moved.events[0]).toMatchObject({ type: "TokenMoved", from: { x: 35, y: 35 } });
  });

  it("forbids a non-owner from moving a token", () => {
    const { state } = withToken();
    const token = Object.values(state.tokens)[0]!;
    const d = decide(state, bob, Command.parse({ type: "token.move", tokenId: token.id, to: { x: 0, y: 0 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("forbids players from GM-only commands", () => {
    const d = decide(baseRoom(), alice, Command.parse({ type: "token.create", name: "x", position: { x: 0, y: 0 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers not_found (not forbidden) for hidden tokens, so rejections don't leak them", () => {
    const { state } = run(baseRoom(), gm, {
      type: "token.create", name: "Ambusher", position: { x: 0, y: 0 }, hidden: true,
    });
    const token = Object.values(state.tokens)[0]!;
    const d = decide(state, alice, Command.parse({ type: "token.move", tokenId: token.id, to: { x: 1, y: 1 } }), ctx);
    expect(d).toMatchObject({ ok: false, code: "not_found" });
  });
});
