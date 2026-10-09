/**
 * A seamless, cloudy fog texture drawn once with fractal value noise: pale grey-white mist with
 * soft darker pockets, like the fog on a printed battle mat or a VTT's cloud cover. Tiles at
 * `FOG_TEXTURE_SIZE` pixels, so the fog can repeat across any map.
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
  const at = (gx: number, gy: number) => values[(gy % cells) * cells + (gx % cells)]!;
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
  const octaves = [
    { cells: 4, weight: 0.5, seed: 11 },
    { cells: 8, weight: 0.27, seed: 23 },
    { cells: 16, weight: 0.15, seed: 37 },
    { cells: 32, weight: 0.08, seed: 51 },
  ].map((o) => ({ ...o, values: lattice(o.cells, o.seed) }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (const o of octaves) n += sample(o.values, o.cells, x / size, y / size) * o.weight;
      // Stretch the middle of the range so the clouds have contrast, then map to grey-white.
      const t = Math.min(1, Math.max(0, (n - 0.25) * 2));
      const shade = 150 + t * 95;
      const i = (y * size + x) * 4;
      image.data[i] = shade;
      image.data[i + 1] = shade + 3;
      image.data[i + 2] = shade + 8;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
