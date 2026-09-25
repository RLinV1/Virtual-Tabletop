import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, hueSatToPoint, isHex, pointToHueSat } from "../src/ui/color";

describe("colour wheel maths (grid-line-style)", () => {
  it("converts primaries and greys both ways", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe("#ffffff");
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("round-trips arbitrary colours", () => {
    for (const hex of ["#3fa7ff", "#c0392b", "#12ab34", "#808080", "#fefefe", "#010203"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("maps wheel points to hue by angle and saturation by distance, capped at the rim", () => {
    expect(pointToHueSat(50, 0, 100)).toEqual({ h: 0, s: 0.5 });
    const down = pointToHueSat(0, 100, 100);
    expect(down.h).toBeCloseTo(90);
    expect(down.s).toBe(1);
    expect(pointToHueSat(300, 0, 100).s).toBe(1);
    const p = hueSatToPoint(210, 0.6, 100);
    const back = pointToHueSat(p.x, p.y, 100);
    expect(back.h).toBeCloseTo(210);
    expect(back.s).toBeCloseTo(0.6);
  });

  it("validates six-digit hex only", () => {
    expect(isHex("#a1b2c3")).toBe(true);
    for (const bad of ["a1b2c3", "#abc", "#gggggg", "#a1b2c3d"]) expect(isHex(bad)).toBe(false);
  });
});
