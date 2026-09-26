import { describe, expect, it } from "vitest";
import { filterEventForViewer, type CommittedEvent } from "../src";
import { alice, attempt, baseRoom, gm, run, withToken } from "./fixtures";

const committed = (event: CommittedEvent["event"]): CommittedEvent => ({ seq: 20, at: "2026-09-26T00:00:00.000Z", actorId: gm.id, event });

describe("changing a token's image (ADR 0008)", () => {
  it("lets the GM replace a token's image and records the one it replaced (invariant 6)", () => {
    const { state, token } = withToken(baseRoom(), { name: "Goblin" });
    const { state: next, events } = run(state, gm, { type: "token.setImage", tokenId: token.id, imageUrl: "/uploads/goblin.png" });
    expect(events).toEqual([
      { type: "TokenImageSet", tokenId: token.id, imageUrl: "/uploads/goblin.png", assetId: null, previous: { imageUrl: null, assetId: null } },
    ]);
    expect(next.tokens[token.id]).toMatchObject({ imageUrl: "/uploads/goblin.png", assetId: null });

    const removed = run(next, gm, { type: "token.setImage", tokenId: token.id, imageUrl: null });
    expect(removed.events[0]).toMatchObject({ imageUrl: null, previous: { imageUrl: "/uploads/goblin.png" } });
    expect(removed.state.tokens[token.id]!.imageUrl).toBeNull();
  });

  it("keeps the library asset id with a library image", () => {
    const { state, token } = withToken(baseRoom());
    const { state: next } = run(state, gm, { type: "token.setImage", tokenId: token.id, imageUrl: "/uploads/a.png", assetId: "asset-1" });
    expect(next.tokens[token.id]!.assetId).toBe("asset-1");
  });

  it("refuses a player, even the token's owner (FR-GM-15)", () => {
    const { state, token } = withToken(baseRoom(), { ownerIds: [alice.id] });
    expect(attempt(state, alice, { type: "token.setImage", tokenId: token.id, imageUrl: "/uploads/x.png" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("rejects setting the image a token already has", () => {
    const { state, token } = withToken(baseRoom());
    expect(attempt(state, gm, { type: "token.setImage", tokenId: token.id, imageUrl: null })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("never tells a player about a hidden token's new image (FR-GM-23)", () => {
    const { state, token } = withToken(baseRoom(), { hidden: true });
    const { events } = run(state, gm, { type: "token.setImage", tokenId: token.id, imageUrl: "/uploads/trap.png" });
    expect(filterEventForViewer(committed(events[0]!), state, alice)).toEqual({ kind: "redacted", seq: 20 });
  });
});
