import { describe, expect, it } from "vitest";
import { Command, filterEventForViewer, reduceAll, Token, type CommittedEvent } from "../src";
import { alice, attempt, baseRoom, gm, run, withToken } from "./fixtures";

describe("KAN-12 token setup", () => {
  it("creates a placed token with image, size, rotation, and numeric resources in one event", () => {
    const { state, events } = run(baseRoom(), gm, {
      type: "token.create", name: "Ogre", position: { x: 125, y: 245 },
      imageUrl: "/uploads/ogre.webp", size: 2, rotation: -90,
      stats: { hp: 32, maxHp: 40, ac: 15 },
    });
    const token = Object.values(state.tokens)[0]!;
    expect(token).toMatchObject({
      name: "Ogre", position: { x: 125, y: 245 }, imageUrl: "/uploads/ogre.webp",
      size: 2, rotation: 270, stats: { hp: 32, maxHp: 40, ac: 15 },
    });
    expect(Token.parse(token)).toEqual(token);
    expect(reduceAll(baseRoom(), events).tokens[token.id]).toEqual(token);
  });

  it("rejects invalid starting resources and keeps old create defaults", () => {
    expect(attempt(baseRoom(), gm, {
      type: "token.create", name: "Ogre", position: { x: 0, y: 0 },
      stats: { hp: 9, maxHp: 8, ac: null },
    })).toMatchObject({ ok: false, code: "invalid" });
    const parsed = Command.parse({ type: "token.create", name: "Old client", position: { x: 0, y: 0 } });
    expect(parsed).toMatchObject({ rotation: 0, stats: { hp: null, maxHp: null, ac: null } });
  });

  it("renames, resizes and rotates a token with a reversible event", () => {
    const { state, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state: changed, events } = run(state, gm, {
      type: "token.setAppearance", tokenId: token.id, name: "Hobgoblin", size: 1.5, rotation: 450,
    });
    expect(changed.tokens[token.id]).toMatchObject({ name: "Hobgoblin", size: 1.5, rotation: 90 });
    expect(events).toEqual([{
      type: "TokenAppearanceSet", tokenId: token.id, name: "Hobgoblin", size: 1.5,
      rotation: 90, previous: { name: "Goblin", size: 1, rotation: 0 },
    }]);
    expect(reduceAll(state, events)).toEqual(changed);
  });

  it("numbers a conflicting rename, rejects players, and redacts hidden updates", () => {
    const first = withToken(baseRoom(), { name: "Goblin" });
    const second = withToken(first.state, { name: "Wolf", hidden: true });
    const input = { type: "token.setAppearance" as const, tokenId: second.token.id, name: "Goblin", size: 2, rotation: 30 };
    expect(attempt(second.state, alice, input)).toMatchObject({ ok: false, code: "forbidden" });
    const { events } = run(second.state, gm, input);
    expect(events[0]).toMatchObject({ name: "Goblin 2" });
    const committed: CommittedEvent = { seq: 10, at: "2026-09-26T00:00:00Z", actorId: gm.id, event: events[0]! };
    expect(filterEventForViewer(committed, second.state, alice)).toEqual({ kind: "redacted", seq: 10 });
  });
});
