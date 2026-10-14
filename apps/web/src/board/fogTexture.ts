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

export type Rgb = readonly [number, number, number];

/** Blue-grey banks and pale mist, used when the map's own colour is not known. */
const DEFAULT_DARK: Rgb = [96, 104, 118];
const DEFAULT_LIGHT: Rgb = [236, 240, 246];

/** Extremes of the sample that do not count towards the map's colour: this share off each end, by brightness. */
const TRIM = 0.1;
/** How far the map colour's hue is pushed away from grey, so a mixed map does not average out to flat grey. */
const CHROMA_LIFT = 1.5;
/** Banks sit this far down from the map colour towards black, and mist this far up towards white. */
const BANK_DARKEN = 0.92;
const MIST_LIGHTEN = 0.47;

/** The mean colour of RGBA pixels once the darkest and lightest tenth are left out. */
export function trimmedMean(data: ArrayLike<number>): Rgb {
  const pixels: { luma: number; r: number; g: number; b: number }[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    pixels.push({ luma: 0.299 * r + 0.587 * g + 0.114 * b, r, g, b });
  }
  pixels.sort((a, b) => a.luma - b.luma);
  const cut = Math.floor(pixels.length * TRIM);
  const kept = pixels.slice(cut, pixels.length - cut);
  const used = kept.length > 0 ? kept : pixels;
  if (used.length === 0) return DEFAULT_DARK;
  let r = 0, g = 0, b = 0;
  for (const p of used) { r += p.r; g += p.g; b += p.b; }
  return [r / used.length, g / used.length, b / used.length];
}

/** The map's own colour, or null when the browser won't let the image be read. */
export function averageColor(source: CanvasImageSource): Rgb | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, 16, 16);
    return trimmedMean(ctx.getImageData(0, 0, 16, 16).data);
  } catch {
    return null;
  }
}

const clamp = (n: number) => Math.min(255, Math.max(0, n));

/**
 * The fog's two shades. With the map's colour, banks are only a little darker and mist a little
 * lighter, so the fog reads as haze over this map; without it, the default blue-grey.
 */
export function fogPalette(base?: Rgb | null): { dark: Rgb; light: Rgb } {
  if (!base) return { dark: DEFAULT_DARK, light: DEFAULT_LIGHT };
  const luma = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
  const lifted = base.map((c) => clamp(luma + (c - luma) * CHROMA_LIFT)) as unknown as Rgb;
  return {
    dark: lifted.map((c) => c * BANK_DARKEN) as unknown as Rgb,
    light: lifted.map((c) => c + (255 - c) * MIST_LIGHTEN) as unknown as Rgb,
  };
}

/**
 * The fog as a canvas; the caller turns it into a repeating texture. Given the map's colour,
 * the fog's dark banks and pale mist are shades of it, so it sits in the map instead of looking
 * pasted on.
 */
export function makeFogCanvas(base?: Rgb | null): HTMLCanvasElement {
  const { dark, light } = fogPalette(base);
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
      const t = Math.min(1, Math.max(0, (n - 0.02) * 2));
      const lift = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      image.data[i] = dark[0] + lift * (light[0] - dark[0]);
      image.data[i + 1] = dark[1] + lift * (light[1] - dark[1]);
      image.data[i + 2] = dark[2] + lift * (light[2] - dark[2]);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** How far mist trails out past a fog region's edge, in grid cells. Inside the edge the fog is solid. */
export const FOG_FEATHER_CELLS = 1.0;
const FEATHER_STEPS = 12;

/**
 * Turns the soft distance ramp (1 inside the region, falling to 0 out in the feather) and a noise
 * value in [0, 1] into the mask's alpha. The noise moves the threshold, so the mist's outer edge
 * billows into tongues and gaps, while the solid interior (ramp 1) stays fully opaque for any noise.
 */
export function fogMaskAlpha(ramp: number, noise: number): number {
  // Noise only counts out in the feather, so the alpha is continuous across the region's edge.
  const amp = 0.3 * Math.min(1, Math.max(0, (1 - ramp) * 4));
  const t = Math.min(1, Math.max(0, (ramp + (noise - 0.5) * amp + 0.12) / 1.12));
  return t * t * (3 - 2 * t);
}

/** Cloud noise at a board position, in [0, 1]; features are about a grid cell across. */
function edgeNoise(layers: { values: Float32Array; cells: number; weight: number }[], u: number, v: number): number {
  let n = 0;
  for (const l of layers) n += sample(l.values, l.cells, u, v) * l.weight;
  return n;
}

/**
 * The fog regions as a white-on-transparent mask at a fraction of the map's size, for the board to
 * use as an alpha mask over the cloud layers. Opaque inside every region; past the edge a
 * noise-broken ramp of mist fades out over `FOG_FEATHER_CELLS`, so the border thins into the map
 * instead of drawing a line. Linear sampling of the small mask softens it further.
 */
export function makeFogMaskCanvas(
  regions: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  width: number,
  height: number,
  cell: number,
): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, 10 / Math.max(1, cell), 1536 / Math.max(1, width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, scale };
  ctx.scale(scale, scale);
  ctx.lineJoin = "miter";
  ctx.miterLimit = 20;
  const trace = () => {
    ctx.beginPath();
    for (const points of regions) {
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    }
  };
  const reach = FOG_FEATHER_CELLS * cell;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  // Wide, faint strokes first: where they overlap near the edge the alpha builds up to solid.
  for (let k = FEATHER_STEPS; k >= 1; k--) {
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = (2 * reach * k) / FEATHER_STEPS;
    trace();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  trace();
  ctx.fill();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const period = Math.max(1, cell) * 40;
  const layers = [
    { cells: 10, weight: 0.3, seed: 3 },
    { cells: 20, weight: 0.3, seed: 7 },
    { cells: 40, weight: 0.25, seed: 19 },
    { cells: 80, weight: 0.15, seed: 31 },
  ].map((l) => ({ ...l, values: lattice(l.cells, l.seed) }));
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const ramp = image.data[i + 3]! / 255;
      const n = ramp >= 1 ? 1 : edgeNoise(layers, (((x + 0.5) / scale) % period) / period, (((y + 0.5) / scale) % period) / period);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * fogMaskAlpha(ramp, n));
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(image, 0, 0);
  return { canvas, scale };
}
