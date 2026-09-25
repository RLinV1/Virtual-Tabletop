/**
 * Colour maths for the grid's colour wheel (grid-line-style). Pure, so it is unit-tested
 * without a canvas. HSV components: hue in degrees [0, 360), saturation and value in [0, 1].
 */

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + hue / 60) % 6;
    return v - v * clamp01(s) * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const byte = (x: number) =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(f(5))}${byte(f(3))}${byte(f(1))}`;
}

export function hexToHsv(hex: string): Hsv {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

export const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Hue and saturation under a point on a wheel of `radius`, measured from its centre: hue by
 * angle (0° at the right, increasing clockwise on screen), saturation by distance, capped
 * at the rim so dragging outside the wheel still picks its edge.
 */
export function pointToHueSat(dx: number, dy: number, radius: number): { h: number; s: number } {
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { h: (angle + 360) % 360, s: clamp01(Math.hypot(dx, dy) / radius) };
}

/** Inverse of `pointToHueSat`: where the marker for a hue and saturation sits. */
export function hueSatToPoint(h: number, s: number, radius: number): { x: number; y: number } {
  const a = (h * Math.PI) / 180;
  return { x: Math.cos(a) * s * radius, y: Math.sin(a) * s * radius };
}
