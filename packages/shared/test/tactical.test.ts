import { describe, expect, it } from "vitest";
import { CONDITIONS, EMPTY_STATS, conditionSpec, hpFraction } from "../src";
import { alice, attempt, baseRoom, bob, gm, run, withToken } from "./fixtures";

describe("token statistics (FR-TAC-07)", () => {
  it("starts empty and records what it replaced", () => {
    const { state, token } = withToken(baseRoom());
    expect(token.stats).toEqual(EMPTY_STATS);

    const { state: next, events } = run(state, gm, {
      type: "token.setStats",
      tokenId: token.id,
      stats: { hp: 24, maxHp: 30, ac: 16 },
    });
    expect(next.tokens[token.id]!.stats).toEqual({ hp: 24, maxHp: 30, ac: 16 });
    // Undo-ready: the event carries the value it replaced (FR-REC-03).
    expect(events[0]).toMatchObject({ type: "TokenStatsSet", previous: EMPTY_STATS });
  });

  it("lets an owner track their own token but not someone else's", () => {
    const { state, token } = withToken(baseRoom(), { ownerIds: [alice.id] });
    const stats = { hp: 10, maxHp: 10, ac: 12 };

    expect(attempt(state, alice, { type: "token.setStats", tokenId: token.id, stats }).ok).toBe(true);
    expect(attempt(state, bob, { type: "token.setStats", tokenId: token.id, stats })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
  });

  it("rejects current HP above maximum", () => {
    const { state, token } = withToken(baseRoom());
    expect(
      attempt(state, gm, {
        type: "token.setStats",
        tokenId: token.id,
        stats: { hp: 40, maxHp: 30, ac: null },
      }),
    ).toMatchObject({ ok: false, code: "invalid" });
  });

  it("answers not_found for a hidden token, so a player cannot probe for one", () => {
    const { state, token } = withToken(baseRoom(), { hidden: true });
    expect(
      attempt(state, alice, {
        type: "token.setStats",
        tokenId: token.id,
        stats: { hp: 1, maxHp: 1, ac: null },
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });

  it("computes the resource bar fraction only when both ends are known", () => {
    expect(hpFraction({ hp: 15, maxHp: 30, ac: null })).toBe(0.5);
    expect(hpFraction({ hp: -5, maxHp: 30, ac: null })).toBe(0);
    expect(hpFraction({ hp: 40, maxHp: 30, ac: null })).toBe(1);
    expect(hpFraction({ hp: 10, maxHp: null, ac: null })).toBeNull();
    expect(hpFraction(EMPTY_STATS)).toBeNull();
  });
});

describe("conditions (FR-TAC-08)", () => {
  it("is identifiable without colour: every condition has a distinct abbreviation", () => {
    const abbrs = CONDITIONS.map((c) => c.abbr);
    expect(new Set(abbrs).size).toBe(CONDITIONS.length);
    for (const c of CONDITIONS) expect(c.abbr).toMatch(/^[A-Z]{2,3}$/);
  });

  it("gives every condition a shape, so colour is never the only signal", () => {
    for (const c of CONDITIONS) expect(c.shape).toBeTruthy();
    // More than one shape in play — otherwise shape carries no information.
    expect(new Set(CONDITIONS.map((c) => c.shape)).size).toBeGreaterThan(1);
  });

  it("looks up a spec by id", () => {
    expect(conditionSpec("prone").label).toBe("Prone");
  });

  it("applies and de-duplicates conditions, carrying the previous set", () => {
    const { state, token } = withToken(baseRoom());
    const { state: next, events } = run(state, gm, {
      type: "token.setConditions",
      tokenId: token.id,
      conditions: ["prone", "poisoned", "prone"],
    });
    expect(next.tokens[token.id]!.conditions).toEqual(["prone", "poisoned"]);
    expect(events[0]).toMatchObject({ type: "TokenConditionsSet", previous: [] });
  });
});

describe("initiative (FR-GM-21)", () => {
  const encounter = () => {
    let state = baseRoom();
    const a = withToken(state, { name: "A" });
    state = a.state;
    const b = withToken(state, { name: "B" });
    state = b.state;
    const c = withToken(state, { name: "C" });
    state = c.state;
    return { state: c.state, ids: [a.token.id, b.token.id, c.token.id] as const };
  };

  it("sorts the order by score descending, on the server", () => {
    const { state, ids } = encounter();
    const { state: next } = run(state, gm, {
      type: "initiative.start",
      entries: [
        { tokenId: ids[0], score: 12 },
        { tokenId: ids[1], score: 20 },
        { tokenId: ids[2], score: 5 },
      ],
    });
    expect(next.initiative).toEqual({ order: [ids[1], ids[0], ids[2]], activeIndex: 0, round: 1 });
  });

  it("advances through the order and starts a new round on wrap", () => {
    const { state, ids } = encounter();
    let s = run(state, gm, {
      type: "initiative.start",
      entries: ids.map((tokenId, i) => ({ tokenId, score: 30 - i })),
    }).state;

    s = run(s, gm, { type: "initiative.advance" }).state;
    expect(s.initiative).toMatchObject({ activeIndex: 1, round: 1 });
    s = run(s, gm, { type: "initiative.advance" }).state;
    expect(s.initiative).toMatchObject({ activeIndex: 2, round: 1 });
    s = run(s, gm, { type: "initiative.advance" }).state;
    expect(s.initiative).toMatchObject({ activeIndex: 0, round: 2 });
  });

  it("is GM-only", () => {
    const { state, ids } = encounter();
    expect(
      attempt(state, alice, { type: "initiative.start", entries: [{ tokenId: ids[0], score: 1 }] }),
    ).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses to advance when no encounter is running", () => {
    expect(attempt(baseRoom(), gm, { type: "initiative.advance" })).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("ending an encounter that is not running is a no-op, not an error", () => {
    const result = attempt(baseRoom(), gm, { type: "initiative.end" });
    expect(result).toEqual({ ok: true, events: [] });
  });

  it("rejects an order naming a token that does not exist", () => {
    expect(
      attempt(baseRoom(), gm, { type: "initiative.start", entries: [{ tokenId: "nope", score: 1 }] }),
    ).toMatchObject({ ok: false, code: "not_found" });
  });
});
