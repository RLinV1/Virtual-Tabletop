import { describe, expect, it } from "vitest";
import { fogPalette, trimmedMean } from "../src/board/fogTexture";

const px = (...rgb: number[][]) => Uint8ClampedArray.from(rgb.flatMap(([r, g, b]) => [r!, g!, b!, 255]));

describe("fog colours follow the map (fog-and-filter-polish, FR-GM-17)", () => {
  it("leaves the darkest and lightest tenth out of the map colour", () => {
    const data = px(...Array.from({ length: 8 }, () => [100, 120, 80]), [0, 0, 0], [255, 255, 255]);
    expect(trimmedMean(data)).toEqual([100, 120, 80]);
  });

  it("makes banks only a little darker and mist a little lighter than the map colour", () => {
    const { dark, light } = fogPalette([120, 130, 90]);
    const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
    expect(luma(dark)).toBeLessThan(luma([120, 130, 90]));
    expect(luma(dark)).toBeGreaterThan(luma([120, 130, 90]) * 0.5);
    expect(luma(light)).toBeGreaterThan(luma([120, 130, 90]));
    expect(luma(light)).toBeLessThan(luma([255, 255, 255]));
  });

  it("keeps a hint of the map's hue instead of going grey", () => {
    const { light } = fogPalette([150, 140, 100]);
    expect(light[0]! - light[2]!).toBeGreaterThan(50 * 0.7);
  });

  it("uses the default blue-grey when the map colour is unknown", () => {
    expect(fogPalette(null).dark).toEqual([96, 104, 118]);
    expect(fogPalette(undefined).light).toEqual([236, 240, 246]);
  });
});
