/**
 * Cuts the home page's map crops and shelf thumbnails from the built-in maps
 * (top-down-default-maps). Run by hand after a map changes: `npm run maps:home -w @vtt/web`.
 * The outputs are committed, so nothing else needs `sharp`.
 *
 * Each crop is 20 squares wide, starts on a grid intersection, and comes out at 1400 x 788,
 * so every crop has exact 70 px squares from its top-left corner whatever the source cell.
 * Check images with the grid drawn in red go to scripts/out/ for review.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** Grids match `src/net/builtinAssets.ts`; crop origins are in grid squares. */
const MAPS = [
  { file: "hero-map", slug: "broken-span", cell: 69.4, offX: 10, offY: 31, col: 2, row: 5 },
  { file: "map-ice", slug: "hollowfrost-keep", cell: 70, offX: 47, offY: 46, col: 23, row: 7 },
  { file: "map-jungle", slug: "temple-green-sun", cell: 70, offX: 21, offY: 36, col: 18, row: 5 },
];

const CROP = { width: 1400, height: 788, squares: 20 };
const THUMB_WIDTH = 640;

/** An SVG of grid lines to lay over an image, for the check images only. */
function gridSvg(width, height, cell, offX, offY) {
  const lines = [];
  for (let x = offX; x < width; x += cell) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  for (let y = offY; y < height; y += cell) lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<g stroke="#ff0000" stroke-width="1.5">${lines.join("")}</g></svg>`,
  );
}

async function check(buffer, out, cell, offX, offY) {
  const { width, height } = await sharp(buffer).metadata();
  await sharp(buffer)
    .composite([{ input: gridSvg(width, height, cell, offX, offY) }])
    .png()
    .toFile(root(`scripts/out/${out}`));
}

await mkdir(root("public/img/home"), { recursive: true });
await mkdir(root("scripts/out"), { recursive: true });

for (const m of MAPS) {
  const source = root(`public/img/${m.file}.webp`);
  const { width, height } = await sharp(source).metadata();

  // Scale so one square is exactly 70 px, then take a whole-pixel crop from the snapped
  // origin. For a 70 px map the scale is 1; for the others it moves the origin under 1 px.
  const scale = CROP.width / CROP.squares / m.cell;
  const left = Math.round((m.offX + m.col * m.cell) * scale);
  const top = Math.round((m.offY + m.row * m.cell) * scale);
  const crop = await sharp(source)
    .resize(Math.round(width * scale), Math.round(height * scale))
    .extract({ left, top, width: CROP.width, height: CROP.height })
    .webp({ quality: 82 })
    .toBuffer();
  await sharp(crop).toFile(root(`public/img/home/${m.slug}.webp`));
  await check(crop, `${m.slug}.png`, CROP.width / CROP.squares, 0, 0);

  const t = THUMB_WIDTH / width;
  const thumb = await sharp(source).resize(THUMB_WIDTH).webp({ quality: 80 }).toBuffer();
  await sharp(thumb).toFile(root(`public/img/home/${m.slug}-thumb.webp`));
  await check(thumb, `${m.slug}-thumb.png`, m.cell * t, m.offX * t, m.offY * t);

  console.log(`${m.slug}: crop at (${left}, ${top}) x${scale.toFixed(4)}, thumbnail ${THUMB_WIDTH} wide`);
}
