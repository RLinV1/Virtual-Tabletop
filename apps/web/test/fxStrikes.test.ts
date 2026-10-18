// @vitest-environment jsdom
import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { ANIMATION_SHAPES } from "@vtt/shared";
import { SHAPE_DEFAULTS } from "../src/board/effectPresets";
import { playStrike, type FxHost } from "../src/board/fx";

function host(reducedMotion: boolean): FxHost {
  return { layer: new Container(), shakeTarget: new Container(), filterTarget: new Container(), screen: { width: 800, height: 600 }, reducedMotion };
}

// jsdom has no canvas; Pixi probes for one when it builds a blur filter, and copes with none.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

const strikeShapes = ANIMATION_SHAPES.filter((s) => s !== "nuke");

describe("every strike shape plays and cleans up (library-animations, ADR 0038)", () => {
  for (const shape of strikeShapes) {
    it(`${shape} draws every frame, ends, and leaves nothing behind`, () => {
      const h = host(false);
      h.shakeTarget.position.set(10, 20);
      const def = SHAPE_DEFAULTS[shape];
      const fx = playStrike(h, { def, from: { x: 100, y: 300 }, to: { x: 420, y: 260 }, radius: 24 });
      expect(h.layer.children).toHaveLength(1);
      let t = 0;
      let alive = true;
      while (alive && t < def.duration + 1) {
        alive = fx.update(t);
        t += 1 / 30;
      }
      expect(alive).toBe(false);
      fx.destroy();
      fx.destroy();
      expect(h.layer.children).toHaveLength(0);
      expect(h.shakeTarget.position.x).toBe(10);
      expect(h.shakeTarget.position.y).toBe(20);
    });

    it(`${shape} copes with the extremes of every setting and with no distance`, () => {
      for (const extreme of [
        { count: 1, spread: 0, arc: 0, trail: 0, spin: 0, gravity: -1, rings: 0, particles: 0 },
        { count: 12, spread: 1, arc: 1, trail: 1, spin: 1, gravity: 1, rings: 5, particles: 120 },
      ]) {
        const h = host(false);
        const fx = playStrike(h, { def: { ...SHAPE_DEFAULTS[shape], ...extreme }, from: { x: 50, y: 50 }, to: { x: 50, y: 50 }, radius: 1 });
        for (let t = 0; t < SHAPE_DEFAULTS[shape].duration; t += 1 / 20) expect(fx.update(t)).toBe(true);
        fx.destroy();
        expect(h.layer.children).toHaveLength(0);
      }
    });

    it(`${shape} is a static ring under reduced motion`, () => {
      const h = host(true);
      h.shakeTarget.position.set(5, 5);
      const fx = playStrike(h, { def: SHAPE_DEFAULTS[shape], from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, radius: 20 });
      expect(fx.update(0.1)).toBe(true);
      expect(fx.update(5)).toBe(false);
      fx.destroy();
      expect(h.layer.children).toHaveLength(0);
      expect(h.shakeTarget.position.x).toBe(5);
    });
  }

  it("reads a definition without the later fields", () => {
    const { shape, duration, primary, secondary, size, particles, glow, shake, flash } = SHAPE_DEFAULTS.volley;
    const h = host(false);
    const fx = playStrike(h, { def: { shape, duration, primary, secondary, size, particles, glow, shake, flash }, from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, radius: 20 });
    for (let t = 0; t < duration; t += 0.05) fx.update(t);
    fx.destroy();
    expect(h.layer.children).toHaveLength(0);
  });
});
