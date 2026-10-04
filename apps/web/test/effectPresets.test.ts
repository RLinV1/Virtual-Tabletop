import { describe, expect, it } from "vitest";
import { CONDITIONS } from "@vtt/shared";
import {
  CONDITION_VISUALS,
  MAX_CONDITION_EMITTERS,
  conditionParticleOptions,
  particleBox,
  particleConditions,
  pickEmitterTokens,
  sparkVectors,
} from "../src/board/effectPresets";

describe("effect presets (board-effects-overlay)", () => {
  it("has a look for every condition", () => {
    expect(Object.keys(CONDITION_VISUALS).sort()).toEqual(CONDITIONS.map((c) => c.id).sort());
  });

  it("gives particle options exactly to the particle conditions", () => {
    for (const { id } of CONDITIONS) {
      const options = conditionParticleOptions(id, 30, false);
      if (CONDITION_VISUALS[id].kind === "particles") expect(options, id).not.toBeNull();
      else expect(options, id).toBeNull();
    }
  });

  it("draws poisoned as rising green bubbles", () => {
    const options = conditionParticleOptions("poisoned", 30, false)!;
    expect(options.particles?.move).toMatchObject({ enable: true, direction: "top" });
    expect(JSON.stringify(options.particles?.color)).toContain("#4ade80");
    expect(options.fpsLimit).toBe(30);
    expect(options.fullScreen).toEqual({ enable: false });
  });

  it("draws no particles under reduced motion", () => {
    for (const { id } of CONDITIONS) expect(conditionParticleOptions(id, 30, true), id).toBeNull();
  });

  it("lists a token's particle conditions in order", () => {
    expect(particleConditions(["prone", "poisoned", "concentrating", "stunned"])).toEqual(["poisoned", "stunned"]);
  });

  it("keeps the nearest tokens to the view centre, at most 12", () => {
    const tokens = Array.from({ length: 20 }, (_, i) => ({ id: i, position: { x: i * 100, y: 0 } }));
    const picked = pickEmitterTokens(tokens, { x: 0, y: 0 });
    expect(picked).toHaveLength(MAX_CONDITION_EMITTERS);
    expect(picked.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(pickEmitterTokens(tokens, { x: 1900, y: 0 }, 2).map((t) => t.id)).toEqual([19, 18]);
  });

  it("spreads sparks evenly, as unit vectors", () => {
    const vectors = sparkVectors(8, 3);
    expect(vectors).toHaveLength(8);
    for (const v of vectors) expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it("makes the particle box taller than the token so particles rise out of it", () => {
    const box = particleBox(30);
    expect(box.height).toBeGreaterThan(60);
    expect(box.offsetY).toBeLessThan(-30);
  });
});
