import { describe, expect, it } from "vitest";
import { reduce, filterStateForViewer, type DomainEvent } from "../src";
import { alice, attempt, baseRoom, gm, run, withToken } from "./fixtures";

/** Initiative scores saved on tokens (ADR 0022). */
function roomWithTokens(hiddenGoblin = false) {
  const first = withToken(baseRoom(), { name: "Aria" });
  const second = withToken(first.state, { name: "Goblin", hidden: hiddenGoblin });
  return { state: second.state, ids: [first.token.id, second.token.id] };
}

describe("initiative scores are saved per token (ADR 0022)", () => {
  it("saves each entered score on its token and keeps it after the encounter ends", () => {
    const { state, ids } = roomWithTokens();
    let s = run(state, gm, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 17 }, { tokenId: ids[1]!, score: 12 }] }).state;
    expect(s.tokens[ids[0]!]!.initiative).toBe(17);
    expect(s.tokens[ids[1]!]!.initiative).toBe(12);
    s = run(s, gm, { type: "initiative.end" }).state;
    expect(s.tokens[ids[0]!]!.initiative).toBe(17);
    expect(s.tokens[ids[1]!]!.initiative).toBe(12);
  });

  it("replaces a saved score and records the one it replaced", () => {
    const { state, ids } = roomWithTokens();
    const first = run(state, gm, { type: "initiative.start", entries: [{ tokenId: ids[1]!, score: 12 }] }).state;
    const second = run(first, gm, { type: "initiative.start", entries: [{ tokenId: ids[1]!, score: 8 }] });
    expect(second.state.tokens[ids[1]!]!.initiative).toBe(8);
    const started = second.events.find((e) => e.type === "InitiativeStarted");
    expect(started).toMatchObject({ scores: [{ tokenId: ids[1], score: 8, previous: 12 }] });
  });

  it("leaves a token that is not in the entries with its saved score", () => {
    const { state, ids } = roomWithTokens();
    const first = run(state, gm, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 17 }, { tokenId: ids[1]!, score: 12 }] }).state;
    const next = run(first, gm, { type: "initiative.start", entries: [{ tokenId: ids[1]!, score: 9 }] }).state;
    expect(next.tokens[ids[0]!]!.initiative).toBe(17);
    expect(next.initiative?.order).toEqual([ids[1]]);
  });

  it("reduces an event from before scores were saved exactly as before", () => {
    const { state, ids } = roomWithTokens();
    const old: DomainEvent = { type: "InitiativeStarted", initiative: { order: [ids[0]!], activeIndex: 0, round: 1 }, previous: null };
    const next = reduce(state, old);
    expect(next.initiative?.order).toEqual([ids[0]]);
    expect(next.tokens).toBe(state.tokens);
  });

  it("does not let a player start an encounter or save scores", () => {
    const { state, ids } = roomWithTokens();
    expect(attempt(state, alice, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 1 }] })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("keeps a hidden token and its score out of a player's state", () => {
    const { state: hidden, ids } = roomWithTokens(true);
    const started = run(hidden, gm, { type: "initiative.start", entries: [{ tokenId: ids[0]!, score: 17 }, { tokenId: ids[1]!, score: 12 }] }).state;
    const seen = filterStateForViewer(started, alice);
    expect(seen.tokens[ids[1]!]).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain("\"initiative\":12");
  });
});
