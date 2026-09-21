import { describe, expect, it } from "vitest";
import { filterEventForViewer, filterStateForViewer, type CommittedEvent } from "../src";
import { alice, baseRoom, gm, run } from "./fixtures";

const commit = (seq: number, event: CommittedEvent["event"]): CommittedEvent => ({
  seq, at: new Date(0).toISOString(), actorId: gm.id, event,
});

describe("player-safe filtering (FR-GM-23)", () => {
  const room = () => {
    let s = run(baseRoom(), gm, { type: "token.create", name: "Visible", position: { x: 0, y: 0 } }).state;
    s = run(s, gm, { type: "token.create", name: "Hidden", position: { x: 0, y: 0 }, hidden: true }).state;
    return s;
  };

  it("removes hidden tokens from player snapshots but not GM snapshots", () => {
    const s = room();
    expect(Object.values(filterStateForViewer(s, alice).tokens).map((t) => t.name)).toEqual(["Visible"]);
    expect(Object.keys(filterStateForViewer(s, gm).tokens)).toHaveLength(2);
  });

  it("redacts events about hidden tokens for players", () => {
    const s = room();
    const hidden = Object.values(s.tokens).find((t) => t.hidden)!;
    const moved = commit(9, { type: "TokenMoved", tokenId: hidden.id, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } });
    expect(filterEventForViewer(moved, s, alice)).toEqual({ kind: "redacted", seq: 9 });
    expect(filterEventForViewer(moved, s, gm)).toMatchObject({ kind: "event" });
    const created = commit(10, { type: "TokenCreated", token: hidden });
    expect(filterEventForViewer(created, s, alice)).toEqual({ kind: "redacted", seq: 10 });
  });

  it("forces a resync when visibility changes", () => {
    const s = room();
    const hidden = Object.values(s.tokens).find((t) => t.hidden)!;
    const reveal = commit(11, { type: "TokenHiddenSet", tokenId: hidden.id, hidden: false, previous: true });
    expect(filterEventForViewer(reveal, s, alice)).toEqual({ kind: "resync" });
  });

  it("never serializes a hidden token name into anything a player receives", () => {
    const s = room();
    const payload = JSON.stringify(filterStateForViewer(s, alice));
    expect(payload).not.toContain("Hidden");
  });
});
