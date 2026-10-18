// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createThumbnailCache, thumbnailKey, thumbnailTime } from "../src/board/animationThumbnail";
import { SHAPE_DEFAULTS } from "../src/board/effectPresets";
import { ANIMATION_SHAPES } from "@vtt/shared";

vi.hoisted(() => { HTMLCanvasElement.prototype.getContext = () => null; });

describe("static animation thumbnails (library-animations, ADR 0038)", () => {
  it("chooses a frame during every shape's animation", () => {
    for (const shape of ANIMATION_SHAPES) {
      const def = SHAPE_DEFAULTS[shape];
      expect(thumbnailTime(def)).toBeGreaterThan(0);
      expect(thumbnailTime(def)).toBeLessThan(def.duration);
    }
  });

  it("shares duplicate requests and renders different definitions one at a time", async () => {
    const calls: string[] = [];
    let finish!: (url: string) => void;
    const first = new Promise<string>(resolve => { finish = resolve; });
    const cache = createThumbnailCache(async def => {
      calls.push(def.shape);
      return def.shape === "slash" ? first : "bolt.png";
    });
    const a = cache.get(SHAPE_DEFAULTS.slash);
    expect(cache.get({ ...SHAPE_DEFAULTS.slash })).toBe(a);
    const b = cache.get(SHAPE_DEFAULTS.bolt);
    await Promise.resolve();
    expect(calls).toEqual(["slash"]);
    finish("slash.png");
    expect(await a).toBe("slash.png");
    expect(await b).toBe("bolt.png");
    expect(calls).toEqual(["slash", "bolt"]);
    expect(await cache.get(SHAPE_DEFAULTS.slash)).toBe("slash.png");
    expect(calls).toHaveLength(2);
  });

  it("refreshes edited settings and bounds cached images", async () => {
    const cache = createThumbnailCache(async def => `${def.glow}.png`, 2);
    const a = { ...SHAPE_DEFAULTS.slash, glow: 0.1 };
    const b = { ...a, glow: 0.2 };
    const c = { ...a, glow: 0.3 };
    expect(thumbnailKey(a)).not.toBe(thumbnailKey(b));
    await cache.get(a);
    await cache.get(b);
    await cache.get(c);
    expect(cache.peek(a)).toBeUndefined();
    expect(cache.peek(c)).toBe("0.3.png");
    expect(cache.size()).toBe(2);
  });

  it("retries failures and leaves later thumbnails usable", async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error("Renderer unavailable")).mockResolvedValue("image.png");
    const cache = createThumbnailCache(render);
    expect(await cache.get(SHAPE_DEFAULTS.slash)).toBeNull();
    expect(await cache.get(SHAPE_DEFAULTS.slash)).toBe("image.png");
    await cache.whenIdle();
    expect(render).toHaveBeenCalledTimes(2);
  });
});
