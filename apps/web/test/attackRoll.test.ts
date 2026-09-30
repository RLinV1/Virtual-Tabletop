import { describe, expect, it } from "vitest";
import { emptyRoomState, type DiceRoll, type RoomState, type Token } from "@vtt/shared";
import {
  attackExpression,
  attackSectionChange,
  clampCount,
  clampModifier,
  damageAmount,
  isSavedRecord,
  isSettingsRecord,
  kindOf,
  latestAttackRoll,
  pendingRulings,
  migrateSaved,
  outcomeKey,
  isPresetRecord,
  presetForRoll,
  presetRollLabel,
  presetSummary,
  shouldPingTarget,
  targetsByDistance,
} from "../src/panels/attackRoll";

const token = (id: string, name: string, x: number, y: number, hidden = false): Token => ({
  id, name, position: { x, y }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
});

describe("attack section helpers (attack-targeting, FR-TAC-09)", () => {
  it("builds NdX±M for every die type", () => {
    expect(attackExpression({ count: 1, sides: 20, modifier: 0 })).toBe("1d20");
    expect(attackExpression({ count: 1, sides: 20, modifier: 5 })).toBe("1d20+5");
    expect(attackExpression({ count: 2, sides: 6, modifier: -1 })).toBe("2d6-1");
    expect(attackExpression({ count: 1, sides: 100, modifier: 0 })).toBe("1d100");
  });

  it("keeps counts and modifiers within the picker's range", () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(50)).toBe(20);
    expect(clampModifier(250)).toBe(99);
    expect(clampModifier(-250)).toBe(-99);
    expect(clampModifier(3.7)).toBe(3);
    expect(clampModifier(Number.NaN)).toBe(0);
    expect(attackExpression({ count: 99, sides: 8, modifier: 500 })).toBe("20d8+99");
  });

  it("accepts only well-formed stored settings and saved attacks", () => {
    const good = { count: 1, sides: 20, modifier: 5, label: "Longsword" };
    expect(isSettingsRecord({ "id-1": good })).toBe(true);
    expect(isSettingsRecord({ "id-1": { ...good, sides: 7 } })).toBe(false);
    expect(isSettingsRecord({ "id-1": { ...good, count: 0 } })).toBe(false);
    expect(isSettingsRecord({ "id-1": 5 })).toBe(false);
    expect(isSettingsRecord([good])).toBe(false);
    expect(isSavedRecord({ "id-1": [{ ...good, name: "Longsword" }] })).toBe(true);
    expect(isSavedRecord({ "id-1": [good] })).toBe(false);
    expect(isSavedRecord({ "id-1": Array.from({ length: 9 }, () => ({ ...good, name: "x" })) })).toBe(false);
  });

  it("reads stored settings from before roll types as to hit (ADR 0011)", () => {
    const old = { count: 1, sides: 20, modifier: 5, label: "Longsword" };
    expect(isSettingsRecord({ "id-1": old })).toBe(true);
    expect(isSettingsRecord({ "id-1": { ...old, kind: "damage" } })).toBe(true);
    expect(isSettingsRecord({ "id-1": { ...old, kind: "heal" } })).toBe(false);
    expect(isSavedRecord({ "id-1": [{ ...old, name: "Damage", kind: "damage" }] })).toBe(true);
    expect(kindOf(old)).toBe("toHit");
    expect(kindOf({ ...old, kind: "damage" })).toBe("damage");
  });

  it("lists targets nearest first, without the attacker", () => {
    const state: RoomState = {
      ...emptyRoomState("room"),
      tokens: {
        aria: token("aria", "Aria", 35, 35),
        orc: token("orc", "Orc", 455, 35),
        goblin: token("goblin", "Goblin 2", 245, 35),
        wolf: token("wolf", "Wolf", 35, 245),
      },
    };
    const list = targetsByDistance(state, "aria");
    expect(list.map((t) => t.token.name)).toEqual(["Goblin 2", "Wolf", "Orc"]);
    expect(list[0]!.distance).toBe("15 ft");
    expect(targetsByDistance(state, "missing")).toEqual([]);
  });

  it("pings only a visible target of a public roll (FR-TAC-05, FR-GM-23)", () => {
    expect(shouldPingTarget({ hidden: false }, "public")).toBe(true);
    expect(shouldPingTarget({ hidden: true }, "public")).toBe(false);
    expect(shouldPingTarget({ hidden: false }, "gm")).toBe(false);
    expect(shouldPingTarget(undefined, "public")).toBe(false);
  });
});

describe("GM rulings list (attack-rulings, FR-TAC-09)", () => {
  const side = (id: string, name: string) => ({ tokenId: id, name, hidden: false });
  const roll = (id: string, kind: "toHit" | "damage", total: number, extra: Partial<DiceRoll> = {}): DiceRoll => ({
    id, expression: kind === "toHit" ? "1d20+5" : "1d8+3", byParticipantId: "p", dice: [1], modifier: 0, total, visibility: "public",
    attack: { actor: side("aria", "Aria"), target: side("goblin", "Goblin"), label: null, kind }, ...extra,
  });
  const goblin = { ...token("goblin", "Goblin", 245, 35), stats: { hp: 12, maxHp: 15, ac: 13 } };
  const state = (rolls: DiceRoll[], tokens: Record<string, Token> = { goblin }): RoomState => ({ ...emptyRoomState("room"), tokens, rolls });

  it("lists unruled to-hit rolls and unapplied damage, newest first", () => {
    const rolls = [
      roll("r1", "toHit", 17),
      roll("r2", "toHit", 9, { verdict: "miss" }),
      roll("r3", "damage", 7),
      roll("r4", "damage", 5, { damageApplied: true }),
      { ...roll("r5", "toHit", 3), attack: undefined },
    ];
    expect(pendingRulings(state(rolls))).toEqual([
      { kind: "damage", roll: rolls[2], hp: 12, maxHp: 15, amount: 7 },
      { kind: "toHit", roll: rolls[0], ac: 13 },
    ]);
  });

  it("drops damage whose target is gone or has no HP, and keeps to-hit rolls with no AC", () => {
    const rolls = [roll("r1", "damage", 7), roll("r2", "toHit", 17)];
    expect(pendingRulings(state(rolls, {}))).toEqual([{ kind: "toHit", roll: rolls[1], ac: null }]);
    const noHp = { goblin: { ...goblin, stats: { hp: null, maxHp: null, ac: null } } };
    expect(pendingRulings(state(rolls, noHp)).map((p) => p.roll.id)).toEqual(["r2"]);
  });

  it("never applies a negative amount", () => {
    expect(damageAmount({ total: -3 })).toBe(0);
    expect(damageAmount({ total: 7 })).toBe(7);
  });
});

describe("named attacks (attack-ux-polish, FR-TAC-09)", () => {
  const d = (count: number, sides: number, modifier: number) => ({ count, sides, modifier });
  const longsword = { name: "Longsword", toHit: d(1, 20, 5), damage: d(1, 8, 3) };

  it("turns saved attacks into named attacks", () => {
    expect(migrateSaved([
      { name: "Longsword", count: 1, sides: 20, modifier: 5, label: "Longsword", kind: "toHit" },
      { name: "Damage", count: 1, sides: 8, modifier: 3, label: "Damage", kind: "damage" },
      { name: "", count: 2, sides: 6, modifier: 0, label: "" },
    ])).toEqual([
      { name: "Longsword", toHit: d(1, 20, 5), damage: null },
      { name: "Damage", toHit: null, damage: d(1, 8, 3) },
      { name: "2d6", toHit: d(2, 6, 0), damage: null },
    ]);
  });

  it("stores only named attacks with a name and at least one roll, at most 8 per token", () => {
    expect(isPresetRecord({ aria: [longsword] })).toBe(true);
    expect(isPresetRecord({ aria: [{ ...longsword, toHit: null, damage: null }] })).toBe(false);
    expect(isPresetRecord({ aria: [{ ...longsword, name: "  " }] })).toBe(false);
    expect(isPresetRecord({ aria: [{ ...longsword, damage: d(1, 7, 0) }] })).toBe(false);
    expect(isPresetRecord({ aria: Array.from({ length: 9 }, () => longsword) })).toBe(false);
  });

  it("finds the named attack a to-hit roll was made with, by label and attacker", () => {
    const side = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false });
    const roll = (label: string | null, kind: "toHit" | "damage" = "toHit", actor = "aria"): DiceRoll => ({
      id: "r", expression: "1d20+5", byParticipantId: "p", dice: [10], modifier: 5, total: 15, visibility: "public",
      attack: { actor: side(actor), target: side("goblin"), label, kind },
    });
    const presets = { aria: [longsword] };
    expect(presetForRoll(presets, roll("Longsword"))).toEqual(longsword);
    expect(presetForRoll(presets, roll("Longsword", "toHit", "bram"))).toBeNull();
    expect(presetForRoll(presets, roll("Axe"))).toBeNull();
    expect(presetForRoll(presets, roll(null))).toBeNull();
    expect(presetForRoll(presets, roll("Longsword", "damage"))).toBeNull();
  });

  it("labels rolls within 40 characters and summarises the dice", () => {
    expect(presetRollLabel(longsword, "toHit")).toBe("Longsword");
    expect(presetRollLabel(longsword, "damage")).toBe("Longsword damage");
    const long = { ...longsword, name: "A".repeat(40) };
    expect(presetRollLabel(long, "damage")).toHaveLength(40);
    expect(presetRollLabel(long, "damage").endsWith(" damage")).toBe(true);
    expect(presetSummary(longsword)).toBe("+5 · 1d8+3");
    expect(presetSummary({ name: "Burning Hands", toHit: null, damage: d(3, 6, 0) })).toBe("3d6");
    expect(presetSummary({ name: "Dagger", toHit: d(1, 20, -1), damage: null })).toBe("-1");
    expect(presetSummary({ name: "Odd", toHit: d(2, 10, 0), damage: null })).toBe("2d10");
  });

  it("changes the outcome key whenever the GM rules or applies, and has none before", () => {
    const base = { id: "r1" };
    expect(outcomeKey(undefined)).toBeNull();
    expect(outcomeKey(base)).toBeNull();
    const hit = outcomeKey({ ...base, verdict: "hit" });
    const miss = outcomeKey({ ...base, verdict: "miss" });
    const applied = outcomeKey({ ...base, damageApplied: true });
    expect(hit).not.toBeNull();
    expect(new Set([hit, miss, applied]).size).toBe(3);
    expect(outcomeKey({ id: "r2", verdict: "hit" })).not.toBe(hit);
  });
});

describe("attack section outside combat (attack-ux-polish)", () => {
  const view = (inEncounter: boolean, yourTurn = false) => ({ inEncounter, yourTurn });

  it("opens when an encounter starts and collapses when it ends", () => {
    expect(attackSectionChange(view(false), view(true), false)).toBe("open");
    expect(attackSectionChange(view(false), view(true, true), true)).toBe("open");
    expect(attackSectionChange(view(true, true), view(false), false)).toBe("collapse");
  });

  it("opens on your turn unless you collapsed it yourself this encounter", () => {
    expect(attackSectionChange(view(true, false), view(true, true), false)).toBe("open");
    expect(attackSectionChange(view(true, false), view(true, true), true)).toBeNull();
  });

  it("leaves it alone otherwise", () => {
    expect(attackSectionChange(view(true, true), view(true, false), false)).toBeNull();
    expect(attackSectionChange(view(true, true), view(true, true), false)).toBeNull();
    expect(attackSectionChange(view(false), view(false), false)).toBeNull();
  });
});

describe("outcome card after an encounter ends (attack-panel-encounter-reset)", () => {
  const side = (id: string, name: string) => ({ tokenId: id, name, hidden: false });
  const roll = (id: string, by: string, attack = true): DiceRoll => ({
    id, expression: "1d20", byParticipantId: by, dice: [10], modifier: 0, total: 10, visibility: "public",
    ...(attack && { attack: { actor: side("aria", "Aria"), target: side("goblin", "Goblin"), label: null, kind: "toHit" as const } }),
  });

  it("shows the participant's latest attack roll", () => {
    const rolls = [roll("r1", "p"), roll("r2", "p"), roll("r3", "q"), roll("r4", "p", false)];
    expect(latestAttackRoll(rolls, "p", null)?.id).toBe("r2");
  });

  it("hides the roll that was latest when the encounter ended", () => {
    expect(latestAttackRoll([roll("r1", "p"), roll("r2", "p")], "p", "r2")).toBeUndefined();
  });

  it("shows a roll made after the encounter ended", () => {
    expect(latestAttackRoll([roll("r1", "p"), roll("r2", "p"), roll("r5", "p")], "p", "r2")?.id).toBe("r5");
  });
});
