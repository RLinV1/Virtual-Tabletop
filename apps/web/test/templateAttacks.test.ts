import { describe, expect, it } from "vitest";
import type { LibraryCreature, Token } from "@vtt/shared";
import { creatureDraft, creatureFromToken } from "../src/pages/creatureDraft";
import { readTokenAttacks } from "../src/panels/attackRoll";

const attacks = [{ name: "Claws", toHit: { count: 1, sides: 20, modifier: 5 }, damage: { count: 2, sides: 6, modifier: 3 } }];
const token: Token = {
  id: "ogre", name: "Ogre", position: { x: 0, y: 0 }, size: 2, rotation: 0,
  color: "#6d4c41", imageUrl: null, ownerIds: [], hidden: false,
  stats: { hp: 30, maxHp: 59, ac: 11 }, conditions: [], attacks,
};

describe("template attacks in Save as creature and From creature (KAN-70)", () => {
  it("round-trips current attacks and stats, making independent copies", () => {
    const prefill = creatureFromToken(token, []);
    const saved: LibraryCreature = { ...prefill, id: "creature", createdAt: new Date(0).toISOString() };
    const draft = creatureDraft(saved);
    expect(draft.attacks).toEqual(attacks);
    expect(draft.stats).toEqual(token.stats);
    draft.attacks[0]!.damage!.modifier = 9;
    expect(token.attacks).toEqual(attacks);
    expect(saved.attacks).toEqual(attacks);
  });

  it("reads current browser edits, including explicitly removing all attacks", () => {
    const local = [{ name: "Slam", toHit: null, damage: { count: 1, sides: 8, modifier: 2 } }];
    const storage = { getItem: (key: string) => key === "vtt.attack.presets" ? JSON.stringify({ ogre: local }) : null, setItem: () => {} };
    expect(readTokenAttacks(token, storage)).toEqual(local);
    expect(readTokenAttacks(token, { ...storage, getItem: () => JSON.stringify({ ogre: [] }) })).toEqual([]);
    expect(readTokenAttacks(token, null)).toEqual(attacks);
    expect(readTokenAttacks(token, { ...storage, getItem: () => "bad json" })).toEqual(attacks);
  });
});
