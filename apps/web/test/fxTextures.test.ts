// @vitest-environment jsdom
import { Assets, Container, Sprite, Texture, type UnresolvedAsset } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANIMATION_SHAPES, PARTICLE_SHAPES, type Point } from "@vtt/shared";
import { NUKE_PRESET, SHAPE_DEFAULTS } from "../src/board/effectPresets";
import { playNuke, playStrike, type FxHost } from "../src/board/fx";
import { PAINTED_PARTICLES, SparkRenderer } from "../src/board/fxParticles";
import { STRIKE_SHAPES, type StrikeShape } from "../src/board/fxStrikes";
import { ARCS, ART_ENDS, FX_ART, StampLayer, arc, fxArtUrl, fxTexture, loadFxTextures, span, stamp, type FxArt } from "../src/board/fxTextures";

// jsdom has no canvas; Pixi probes for one when it builds a blur filter, and copes with none.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

function host(): FxHost {
  return { layer: new Container(), shakeTarget: new Container(), filterTarget: new Container(), screen: { width: 800, height: 600 }, reducedMotion: false };
}

function visibleSprites(root: Container): Sprite[] {
  return root.children.flatMap((child) => [
    ...(child instanceof Sprite && child.visible ? [child] : []),
    ...(child instanceof Container ? visibleSprites(child) : []),
  ]);
}

/** Where a sprite draws the point `u, v` (shares of its picture's side). */
function drawnAt(sprite: Sprite, u: number, v: number): Point {
  const x = (u - sprite.anchor.x) * sprite.texture.width * sprite.scale.x;
  const y = (v - sprite.anchor.y) * sprite.texture.height * sprite.scale.y;
  const cos = Math.cos(sprite.rotation);
  const sin = Math.sin(sprite.rotation);
  return { x: sprite.position.x + x * cos - y * sin, y: sprite.position.y + x * sin + y * cos };
}

/** One stand-in texture per picture, so a drawn sprite tells which picture it shows. */
const art = new Map<FxArt, Texture>(FX_ART.map((name) => [name, new Texture({ source: Texture.WHITE.source })]));
const nameOf = (texture: Texture) => [...art].find(([, t]) => t === texture)?.[0];
const srcName = (asset: unknown) => FX_ART.find((name) => fxArtUrl(name) === (asset as UnresolvedAsset).src)!;

/** The pictures every strike shares at its impact; a shape's own parts are the others. */
const SHARED_IMPACT: readonly FxArt[] = ["impact-burst", "shockwave-ring"];

const strikeShapes = ANIMATION_SHAPES.filter((s): s is StrikeShape => s !== "nuke");

afterEach(() => {
  vi.restoreAllMocks();
});

// The textures are cached for the whole page, so these run in order: none loaded, some, then all.
describe("painted effect textures with a vector fallback (FR-TAC-09, ADR 0038)", () => {
  it("draws the vector look until the textures load", () => {
    expect(fxTexture("glow")).toBeNull();
    const layer = new StampLayer();
    expect(stamp(layer, "glow", { x: 0, y: 0 }, 10, 0xffffff, 1)).toBe(false);
    const h = host();
    const fx = playStrike(h, { def: SHAPE_DEFAULTS.fireball, from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, radius: 24 });
    for (let t = 0; t < SHAPE_DEFAULTS.fireball.duration; t += 1 / 30) {
      fx.update(t);
      expect(visibleSprites(h.layer)).toHaveLength(0);
    }
    fx.destroy();
  });

  it("keeps the vector look for a texture that fails, and asks for it again on the next load", async () => {
    const load = vi.spyOn(Assets, "load").mockImplementation((async (asset: unknown) => {
      if (srcName(asset) === "lightning") throw new Error("404");
      return art.get(srcName(asset));
    }) as typeof Assets.load);
    await loadFxTextures();
    expect(load.mock.calls.map(([asset]) => (asset as UnresolvedAsset).src).sort()).toEqual(FX_ART.map(fxArtUrl).sort());
    expect(fxTexture("glow")).toBe(art.get("glow"));
    expect(fxTexture("lightning")).toBeNull();
    expect(span(new StampLayer(), "lightning", { x: 0, y: 0 }, { x: 100, y: 0 }, 20, 0xffffff, 1)).toBe(false);

    // The bolt still plays, its lightning drawn as vectors.
    const h = host();
    const fx = playStrike(h, { def: SHAPE_DEFAULTS.bolt, from: { x: 0, y: 0 }, to: { x: 300, y: 0 }, radius: 24 });
    let drawn = new Set<FxArt | undefined>();
    for (let t = 0; t < SHAPE_DEFAULTS.bolt.duration; t += 1 / 30) {
      fx.update(t);
      drawn = new Set([...drawn, ...visibleSprites(h.layer).map((s) => nameOf(s.texture))]);
    }
    fx.destroy();
    expect(drawn.has("lightning")).toBe(false);
    expect(drawn.has("glow")).toBe(true);
    expect(h.layer.children).toHaveLength(0);

    load.mockImplementation((async (asset: unknown) => art.get(srcName(asset))) as typeof Assets.load);
    await loadFxTextures();
    expect(fxTexture("lightning")).toBe(art.get("lightning"));
  });

  for (const shape of strikeShapes) {
    it(`${shape} draws painted parts of its own before it lands, and ending it keeps the textures`, () => {
      const h = host();
      const def = SHAPE_DEFAULTS[shape];
      const land = STRIKE_SHAPES[shape].land * def.duration;
      const fx = playStrike(h, { def, from: { x: 100, y: 300 }, to: { x: 420, y: 260 }, radius: 24 });
      const own = new Set<FxArt>();
      for (let t = 0; t < def.duration; t += 1 / 30) {
        fx.update(t);
        for (const sprite of visibleSprites(h.layer)) {
          const name = nameOf(sprite.texture);
          if (!name) continue;
          // Grey-on-black pictures add light; the thrown props, with their own transparency, are drawn plainly.
          expect(sprite.blendMode).toBe(name === "tnt" || name === "poison-vial" || name.startsWith("debris-") ? "normal" : "add");
          if (t < land && !SHARED_IMPACT.includes(name) && !name.startsWith("particle-")) own.add(name);
        }
      }
      expect(own.size).toBeGreaterThan(0);
      if (shape === "explosion") expect(own.has("tnt")).toBe(true);
      if (shape === "poison") expect(own.has("poison-vial")).toBe(true);
      if (shape === "tornado") expect([...own].some((name) => name.startsWith("debris-"))).toBe(true);
      fx.destroy();
      expect(h.layer.children).toHaveLength(0);
      for (const texture of art.values()) expect(texture.destroyed).toBe(false);
    });
  }

  it("flares the nuke with the starburst, textured rings, painted bomb, billows and blast wave, and frees them with it", () => {
    const h = host();
    const fx = playNuke(h, { def: NUKE_PRESET, origin: { x: 400, y: 300 }, unit: 60, extent: 500 });
    const drawn = new Set<FxArt | undefined>();
    for (let t = 0; t < NUKE_PRESET.duration; t += 1 / 30) {
      fx.update(t);
      for (const sprite of visibleSprites(h.layer)) drawn.add(nameOf(sprite.texture));
    }
    expect(drawn).toContain("impact-burst");
    expect(drawn).toContain("shockwave-ring");
    expect(drawn).toContain("mushroom-cloud");
    expect(drawn).toContain("nuke-bomb");
    expect(drawn).toContain("nuke-billow");
    expect(drawn).toContain("blast-wave");
    fx.destroy();
    expect(h.layer.children).toHaveLength(0);
    for (const texture of art.values()) expect(texture.destroyed).toBe(false);
  });

  it("draws every particle look with its painted sprite once the sprites load", () => {
    for (const look of PARTICLE_SHAPES) {
      const sparks = new SparkRenderer();
      sparks.draw([{ x: 0, y: 0, vx: 1, vy: 0, age: 0, life: 1, size: 4, color: 0xff0000, gravity: 0, rot: 0, spin: 0 }], look);
      expect(visibleSprites(sparks.container).map((s) => nameOf(s.texture))).toContain(PAINTED_PARTICLES[look].art);
      sparks.container.destroy({ children: true });
    }
  });

  it("stretches a long picture so its drawing runs from one point to the other, mirrored or not", () => {
    const a = { x: 40, y: 50 };
    const b = { x: 260, y: 170 };
    for (const name of ["lightning", "energy-streak", "ice-shard", "beam"] as const) {
      for (const flip of [false, true]) {
        const layer = new StampLayer();
        expect(span(layer, name, a, b, 60, 0xffffff, 1, flip)).toBe(true);
        const sprite = layer.container.children[0] as Sprite;
        const ends = ART_ENDS[name]!;
        const start = drawnAt(sprite, ends.from.x, ends.from.y);
        const end = drawnAt(sprite, ends.to.x, ends.to.y);
        expect(start.x).toBeCloseTo(a.x, 6);
        expect(start.y).toBeCloseTo(a.y, 6);
        expect(end.x).toBeCloseTo(b.x, 6);
        expect(end.y).toBeCloseTo(b.y, 6);
        expect(Math.abs(sprite.scale.y * sprite.texture.height)).toBeCloseTo(60, 6);
      }
    }
  });

  it("lays an arc picture on its circle, bulging the way it is turned", () => {
    const centre = { x: 100, y: 100 };
    for (const name of ["slash-arc", "sonic-wave"] as const) {
      const shape = ARCS[name]!;
      for (const side of [1, -1]) {
        const layer = new StampLayer();
        expect(arc(layer, name, centre, 50, 0.4, side, 0xffffff, 1)).toBe(true);
        const sprite = layer.container.children[0] as Sprite;
        const bulge = drawnAt(sprite, shape.x + Math.cos(shape.bulge) * shape.radius, shape.y + Math.sin(shape.bulge) * shape.radius);
        expect(bulge.x).toBeCloseTo(centre.x + Math.cos(0.4) * 50, 6);
        expect(bulge.y).toBeCloseTo(centre.y + Math.sin(0.4) * 50, 6);
      }
    }
  });

  it("reuses one effect's sprites from frame to frame and hides the ones a frame leaves out", () => {
    const layer = new StampLayer();
    layer.begin();
    for (let i = 0; i < 3; i++) stamp(layer, "glow", { x: i, y: 0 }, 10, 0xffffff, 1);
    layer.end();
    layer.begin();
    stamp(layer, "glow", { x: 0, y: 0 }, 10, 0xffffff, 1);
    layer.end();
    expect(layer.container.children).toHaveLength(3);
    expect(visibleSprites(layer.container)).toHaveLength(1);
  });
});
