/**
 * A seamless, cloudy fog texture drawn once with domain-warped fractal value noise: wisps of pale
 * mist curling through darker blue-grey banks. Tiles at `FOG_TEXTURE_SIZE` pixels, so the fog can
 * repeat across any map; the board layers it twice, at different scales and angles, so the
 * repeat doesn't show.
 */
export const FOG_TEXTURE_SIZE = 512;

/** Small deterministic generator so every client draws the same clouds. */
function lattice(size: number, seed: number): Float32Array {
  const values = new Float32Array(size * size);
  let s = seed >>> 0;
  for (let i = 0; i < values.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    values[i] = s / 0xffffffff;
  }
  return values;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise on a wrapping `cells`×`cells` lattice, sampled at (u, v) in [0, 1). */
function sample(values: Float32Array, cells: number, u: number, v: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (n: number) => ((n % cells) + cells) % cells;
  const at = (gx: number, gy: number) => values[wrap(gy) * cells + wrap(gx)]!;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** The fog as a canvas; the caller turns it into a repeating texture. */
export function makeFogCanvas(): HTMLCanvasElement {
  const size = FOG_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const fbm = (octaves: { cells: number; weight: number; values: Float32Array }[], u: number, v: number) => {
    let n = 0;
    for (const o of octaves) n += sample(o.values, o.cells, u, v) * o.weight;
    return n;
  };
  const octaves = (seed: number) => [
    { cells: 4, weight: 0.5, seed },
    { cells: 8, weight: 0.27, seed: seed + 12 },
    { cells: 16, weight: 0.15, seed: seed + 26 },
    { cells: 32, weight: 0.08, seed: seed + 40 },
  ].map((o) => ({ ...o, values: lattice(o.cells, o.seed) }));
  const mist = octaves(11);
  const warpX = octaves(101);
  const warpY = octaves(211);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Bend the lookup by another noise field, so the clouds stretch into curls and wisps.
      const n = fbm(mist, u + 0.35 * (fbm(warpX, u, v) - 0.5), v + 0.35 * (fbm(warpY, u, v) - 0.5));
      // Stretch the middle of the range for contrast: dark blue-grey banks, pale mist on top.
      const t = Math.min(1, Math.max(0, (n - 0.22) * 2.1));
      const lift = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      image.data[i] = 96 + lift * 140;
      image.data[i + 1] = 104 + lift * 136;
      image.data[i + 2] = 118 + lift * 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
