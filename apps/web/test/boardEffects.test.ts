import { describe, expect, it } from "vitest";
import { CONDITIONS, emptyRoomState, type DiceRoll, type DomainEvent, type Participant, type RoomState, type Token } from "@vtt/shared";
import {
  CONDITION_EFFECTS,
  MAX_ATTACK_EFFECTS,
  REST_TIME,
  artStyleFor,
  attackEffectFor,
  attackPlan,
  conditionLoopWanted,
  conditionShapes,
  loopFrameDue,
  loopingConditions,
} from "../src/board/effects";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const player: Participant = { id: "p1", role: "player", displayName: "Aria" };

const token = (id: string, hidden = false): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
});

const side = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false });

const roll = (over: Partial<DiceRoll> = {}): DiceRoll => ({
  id: "r1", expression: "1d20", byParticipantId: "gm", dice: [12], modifier: 0, total: 12, visibility: "public",
  attack: { actor: side("a"), target: side("b"), label: null, kind: "toHit" },
  ...over,
});

const room = (over: { tokens?: Token[]; rolls?: DiceRoll[] } = {}): RoomState => ({
  ...emptyRoomState("room"),
  tokens: Object.fromEntries((over.tokens ?? [token("a"), token("b")]).map((t) => [t.id, t])),
  rolls: over.rolls ?? [roll()],
});

const rolled = (r: DiceRoll): DomainEvent => ({ type: "DiceRolled", roll: r });
const ruled = (verdict: "hit" | "miss" | null): DomainEvent => ({ type: "RollRuled", rollId: "r1", verdict, previous: null });
const applied = (amount = 7): DomainEvent => ({ type: "RollDamageApplied", rollId: "r1", amount });

describe("attackEffectFor: which events animate (KAN-76)", () => {
  it("strikes from the attacker to the target for a visible attack roll", () => {
    expect(attackEffectFor(rolled(roll()), room(), gm)).toEqual({ kind: "strike", fromId: "a", toId: "b" });
    expect(attackEffectFor(rolled(roll()), room(), player)).toEqual({ kind: "strike", fromId: "a", toId: "b" });
  });

  it("strikes for a damage roll too", () => {
    const damage = roll({ attack: { actor: side("a"), target: side("b"), label: null, kind: "damage" } });
    expect(attackEffectFor(rolled(damage), room({ rolls: [damage] }), gm)).toMatchObject({ kind: "strike" });
  });

  it("does nothing for a plain roll", () => {
    const plain = roll({ attack: undefined });
    expect(attackEffectFor(rolled(plain), room({ rolls: [plain] }), gm)).toBeNull();
  });

  it("does nothing for an event that is not an attack", () => {
    const moved: DomainEvent = { type: "TokenMoved", tokenId: "a", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
    expect(attackEffectFor(moved, room(), gm)).toBeNull();
  });

  it("does nothing when a side is null in this viewer's copy (FR-GM-23)", () => {
    const blanked = roll({ attack: { actor: null, target: side("b"), label: null, kind: "toHit" } });
    expect(attackEffectFor(rolled(blanked), room({ rolls: [blanked] }), player)).toBeNull();
    const noTarget = roll({ attack: { actor: side("a"), target: null, label: null, kind: "toHit" } });
    expect(attackEffectFor(rolled(noTarget), room({ rolls: [noTarget] }), player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), room({ rolls: [noTarget] }), player)).toBeNull();
    expect(attackEffectFor(applied(), room({ rolls: [noTarget] }), player)).toBeNull();
  });

  it("does nothing when a token is missing from the viewer's state (FR-GM-23)", () => {
    expect(attackEffectFor(rolled(roll()), room({ tokens: [token("a")] }), gm)).toBeNull();
    expect(attackEffectFor(rolled(roll()), room({ tokens: [token("b")] }), gm)).toBeNull();
    expect(attackEffectFor(ruled("hit"), room({ tokens: [token("a")] }), gm)).toBeNull();
  });

  it("does nothing for a player when the attacker or target is hidden, but plays for the GM (FR-GM-23)", () => {
    const hiddenAttacker = room({ tokens: [token("a", true), token("b")] });
    expect(attackEffectFor(rolled(roll()), hiddenAttacker, player)).toBeNull();
    expect(attackEffectFor(rolled(roll()), hiddenAttacker, gm)).toMatchObject({ kind: "strike" });
    const hiddenTarget = room({ tokens: [token("a"), token("b", true)] });
    expect(attackEffectFor(rolled(roll()), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(applied(), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), hiddenTarget, gm)).toEqual({ kind: "hit", tokenId: "b" });
  });
});

describe("attackEffectFor: rulings with a hidden side (KAN-76, FR-GM-23)", () => {
  it("plays no hit, miss or damage when the attacker is blanked or hidden for the player", () => {
    const blanked = roll({ attack: { actor: null, target: side("b"), label: null, kind: "toHit" } });
    expect(attackEffectFor(ruled("hit"), room({ rolls: [blanked] }), player)).toBeNull();
    expect(attackEffectFor(applied(), room({ rolls: [blanked] }), player)).toBeNull();
    const hiddenActor = room({ tokens: [token("a", true), token("b")] });
    expect(attackEffectFor(ruled("miss"), hiddenActor, player)).toBeNull();
    expect(attackEffectFor(ruled("miss"), hiddenActor, gm)).toMatchObject({ kind: "miss", tokenId: "b" });
  });
});

describe("attackEffectFor: GM-only rolls (KAN-76, FR-GM-22)", () => {
  it("never strikes for a player on a GM-only roll, even if one arrived", () => {
    const gmRoll = roll({ visibility: "gm" });
    expect(attackEffectFor(rolled(gmRoll), room({ rolls: [gmRoll] }), player)).toBeNull();
    expect(attackEffectFor(rolled(gmRoll), room({ rolls: [gmRoll] }), gm)).toMatchObject({ kind: "strike" });
  });
});

describe("attackEffectFor: rulings and damage (KAN-76)", () => {
  it("plays hit and miss on the roll's target, and nothing when the verdict is cleared", () => {
    expect(attackEffectFor(ruled("hit"), room(), player)).toEqual({ kind: "hit", tokenId: "b" });
    expect(attackEffectFor(ruled("miss"), room(), player)).toEqual({ kind: "miss", tokenId: "b" });
    expect(attackEffectFor(ruled(null), room(), gm)).toBeNull();
  });

  it("plays the damage amount on the target", () => {
    expect(attackEffectFor(applied(7), room(), gm)).toEqual({ kind: "damage", tokenId: "b", amount: 7 });
    expect(attackEffectFor(applied(0), room(), gm)).toBeNull();
  });

  it("does nothing for an unknown roll or an undone damage apply", () => {
    expect(attackEffectFor(ruled("hit"), room({ rolls: [] }), gm)).toBeNull();
    expect(attackEffectFor({ type: "RollDamageUnapplied", rollId: "r1", amount: 7 }, room(), gm)).toBeNull();
  });
});

describe("attack plans under reduced motion (KAN-76)", () => {
  const effects = [
    { kind: "strike", fromId: "a", toId: "b" },
    { kind: "hit", tokenId: "b" },
    { kind: "miss", tokenId: "b" },
    { kind: "damage", tokenId: "b", amount: 3 },
  ] as const;

  it("travels and moves normally, each within 1.2 s", () => {
    for (const effect of effects) {
      const plan = attackPlan(effect, false);
      expect(plan.motion).toBe(true);
      expect(plan.durationMs).toBeLessThanOrEqual(1200);
    }
  });

  it("is a static, short-lived marker when motion is reduced", () => {
    for (const effect of effects) {
      const plan = attackPlan(effect, true);
      expect(plan.motion).toBe(false);
      expect(plan.durationMs).toBeLessThanOrEqual(1000);
    }
  });

  it("caps concurrent effects at 8", () => {
    expect(MAX_ATTACK_EFFECTS).toBe(8);
  });
});

describe("condition effects (KAN-76, FR-TAC-08)", () => {
  it("has an effect for every condition", () => {
    for (const { id } of CONDITIONS) expect(CONDITION_EFFECTS[id], id).toBeDefined();
    expect(Object.keys(CONDITION_EFFECTS).sort()).toEqual(CONDITIONS.map((c) => c.id).sort());
  });

  it("draws the named effects", () => {
    expect(conditionShapes(["poisoned"], 1, 30).length).toBeGreaterThan(0);
    expect(conditionShapes(["stunned"], 1, 30)).toHaveLength(3);
    expect(conditionShapes(["concentrating"], 1, 30)).toHaveLength(1);
    expect(conditionShapes(["prone"], 1, 30)).toHaveLength(0);
  });

  it("pulses over time but holds still at the rest time", () => {
    const at = (t: number) => JSON.stringify(conditionShapes(["concentrating"], t, 30));
    expect(at(0)).not.toEqual(at(0.5));
    expect(at(REST_TIME)).toEqual(at(REST_TIME));
  });

  it("styles the art: invisible fades, prone tilts, unconscious greys", () => {
    expect(artStyleFor(["invisible"], false).alpha).toBeLessThan(0.5);
    expect(artStyleFor(["prone"], false).tilt).toBe(70);
    expect(artStyleFor(["unconscious"], false).greyscale).toBe(true);
    expect(artStyleFor([], false)).toEqual({ alpha: 1, tilt: 0, squash: 1, greyscale: false, tremble: 0 });
    expect(artStyleFor(["stunned", "prone"], false).tilt).toBe(70);
  });

  it("selects static variants under reduced motion", () => {
    expect(artStyleFor(["frightened"], false).tremble).toBeGreaterThan(0);
    expect(artStyleFor(["frightened"], true).tremble).toBe(0);
  });

  it("knows which conditions move", () => {
    expect(loopingConditions(["poisoned", "prone", "blinded", "frightened"])).toEqual(["poisoned", "frightened"]);
    expect(loopingConditions([])).toEqual([]);
  });
});

describe("condition loop budget (KAN-76)", () => {
  it("runs only with a looping token, a visible page and motion allowed", () => {
    const on = { loopingTokens: 1, pageVisible: true, reducedMotion: false };
    expect(conditionLoopWanted(on)).toBe(true);
    expect(conditionLoopWanted({ ...on, loopingTokens: 0 })).toBe(false);
    expect(conditionLoopWanted({ ...on, pageVisible: false })).toBe(false);
    expect(conditionLoopWanted({ ...on, reducedMotion: true })).toBe(false);
  });

  it("draws at most 30 frames a second", () => {
    expect(loopFrameDue(1000, 1000)).toBe(false);
    expect(loopFrameDue(1016, 1000)).toBe(false);
    expect(loopFrameDue(1030, 1000)).toBe(false);
    expect(loopFrameDue(1034, 1000)).toBe(true);
  });
});
