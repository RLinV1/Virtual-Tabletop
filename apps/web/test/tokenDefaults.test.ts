import { describe, expect, it } from "vitest";
import { DEFAULT_AC, DEFAULT_HP, statsWithDefaults } from "../src/panels/tokenDefaults";

describe("Add token stat defaults (token-stat-defaults)", () => {
  it("gives a token with blank HP and AC 100/100 HP and AC 0", () => {
    expect(statsWithDefaults({ hp: null, maxHp: null, ac: null })).toEqual({ hp: DEFAULT_HP, maxHp: DEFAULT_HP, ac: DEFAULT_AC });
    expect(DEFAULT_HP).toBe(100);
    expect(DEFAULT_AC).toBe(0);
  });

  it("keeps every value the GM typed", () => {
    expect(statsWithDefaults({ hp: 7, maxHp: 12, ac: 15 })).toEqual({ hp: 7, maxHp: 12, ac: 15 });
  });

  it("starts a blank HP at the Max HP typed", () => {
    expect(statsWithDefaults({ hp: null, maxHp: 22, ac: 13 })).toEqual({ hp: 22, maxHp: 22, ac: 13 });
  });

  it("matches a blank Max HP to a positive HP", () => {
    expect(statsWithDefaults({ hp: 30, maxHp: null, ac: null })).toEqual({ hp: 30, maxHp: 30, ac: 0 });
  });

  it("uses the default Max HP when HP is zero or below", () => {
    expect(statsWithDefaults({ hp: 0, maxHp: null, ac: null })).toEqual({ hp: 0, maxHp: 100, ac: 0 });
  });
});
