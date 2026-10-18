import { describe, expect, it } from "vitest";
import { ANIMATION_SHAPES, AnimationDef, CONDITIONS, NukeAnimationDef, StrikeAnimationDef } from "@vtt/shared";
import {
  ATTACK_STYLE_PRESETS,
  BUILTIN_ANIMATIONS,
  CONDITION_VISUALS,
  NUKE_PRESET,
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

  it("gives every condition a mark in the overlay, prone included", () => {
    for (const { id } of CONDITIONS) expect(CONDITION_VISUALS[id].kind, id).toMatch(/^(particles|ring|text|veil)$/);
    expect(CONDITION_VISUALS.prone.kind).toBe("ring");
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

describe("built-in attack and nuke animations (FR-TAC-09, ADR 0038)", () => {
  it("parses every style preset as an AnimationDef that can be used for an attack", () => {
    for (const [style, def] of Object.entries(ATTACK_STYLE_PRESETS)) {
      expect(AnimationDef.safeParse(def).success, style).toBe(true);
      expect(StrikeAnimationDef.safeParse(def).success, style).toBe(true);
    }
  });

  it("gives melee a slash, ranged a projectile and magic a bolt", () => {
    expect(ATTACK_STYLE_PRESETS.melee.shape).toBe("slash");
    expect(ATTACK_STYLE_PRESETS.ranged.shape).toBe("projectile");
    expect(ATTACK_STYLE_PRESETS.magic.shape).toBe("bolt");
  });

  it("parses the nuke preset as a nuke animation", () => {
    expect(NukeAnimationDef.safeParse(NUKE_PRESET).success).toBe(true);
    expect(NUKE_PRESET).toMatchObject({ shape: "nuke", size: 3, particles: 120 });
  });

  it("lists all four built-ins for the library, each valid", () => {
    expect(BUILTIN_ANIMATIONS).toHaveLength(8);
    // Every shape has a starting point.
    expect(new Set(BUILTIN_ANIMATIONS.map((b) => b.def.shape))).toEqual(new Set(ANIMATION_SHAPES));
    for (const b of BUILTIN_ANIMATIONS) expect(AnimationDef.safeParse(b.def).success, b.name).toBe(true);
  });
});
