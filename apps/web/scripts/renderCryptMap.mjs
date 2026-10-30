/**
 * Draws the Sunken Crypt built-in map and writes its walls, both from the one LAYOUT below, so
 * the art and the stored walls cannot drift (shipped-maps-line-of-sight, FR-GM-09, FR-GM-19).
 * Run by hand after the layout changes: `npm run render:crypt -w @vtt/web`.
 *
 * Outputs (committed): public/img/map-crypt.webp, public/img/home/sunken-crypt-thumb.webp and
 * packages/shared/src/shippedWalls/sunken-crypt.ts. A check image with the walls drawn in red
 * goes to the OS temp dir (path printed).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const CELL = 70;
const COLS = 40;
const ROWS = 24;

/** Columns and rows are inclusive grid squares. Everything starts as solid wall. */
const LAYOUT = {
  floors: [
    [2, 6, 11, 17], // entry hall (west)
    [12, 11, 19, 11], // corridor east, through the hall's archway at col 12
    [21, 6, 31, 17], // pillared chapel
    [14, 6, 19, 9], // side vault
    [2, 19, 11, 22], // guard room
    [32, 11, 37, 11], // archway out of the chapel, then the gallery's first leg
    [37, 11, 37, 20], // gallery bends south
    [13, 20, 37, 20], // long gallery west to the guard room's door
  ],
  pillars: [[4, 8], [9, 8], [4, 15], [9, 15], [23, 9], [26, 9], [29, 9], [23, 14], [26, 14], [29, 14]],
  doors: [[20, 11, "closed"], [12, 20, "closed"], [16, 10, "locked"]],
  windows: [[6, 18]],
};

function buildGrid() {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill("#"));
  for (const [c0, r0, c1, r1] of LAYOUT.floors) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ".";
  for (const [c, r] of LAYOUT.pillars) g[r][c] = "o";
  for (const [c, r, s] of LAYOUT.doors) g[r][c] = s === "locked" ? "L" : "D";
  for (const [c, r] of LAYOUT.windows) g[r][c] = "w";
  return g;
}

const walkable = (ch) => ch === "." || ch === "o" || ch === "D" || ch === "L";

/** Every wall block edge that faces a walkable square, merged along each straight run. */
function buildWalls(g) {
  const at = (c, r) => (g[r] && g[r][c]) || "#";
  const runs = new Map(); // "H|y|kind" or "V|x|kind" -> start offsets of the squares
  const addEdge = (orient, line, from, kind) => {
    const key = `${orient}|${line}|${kind}`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(from);
  };
  const dirs = [[0, -1, "H", 0], [0, 1, "H", 1], [-1, 0, "V", 0], [1, 0, "V", 1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    // Pillar squares get their own 4 edges below, so they are not wall faces here.
    if (!walkable(g[r][c]) || g[r][c] === "o") continue;
    for (const [dc, dr, orient, far] of dirs) {
      const n = at(c + dc, r + dr);
      if (walkable(n)) continue;
      const kind = n === "w" ? "window" : "wall";
      if (orient === "H") addEdge("H", (r + far) * CELL, c * CELL, kind);
      else addEdge("V", (c + far) * CELL, r * CELL, kind);
    }
  }
  const walls = [];
  for (const [key, starts] of runs) {
    const [orient, lineStr, kind] = key.split("|");
    const line = Number(lineStr);
    starts.sort((a, b) => a - b);
    let s = starts[0], e = s + CELL;
    const flush = () => {
      const seg = orient === "H" ? { a: { x: s, y: line }, b: { x: e, y: line } } : { a: { x: line, y: s }, b: { x: line, y: e } };
      walls.push(kind === "window" ? { ...seg, portal: { kind: "window", state: "closed" } } : seg);
    };
    for (const st of starts.slice(1)) {
      if (st === e && kind === "wall") e += CELL; // windows stay one square each
      else { flush(); s = st; e = st + CELL; }
    }
    flush();
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = g[r][c];
    const x0 = c * CELL, y0 = r * CELL;
    if (ch === "o") {
      const p = [[x0, y0], [x0 + CELL, y0], [x0 + CELL, y0 + CELL], [x0, y0 + CELL]];
      for (let i = 0; i < 4; i++) walls.push({ a: { x: p[i][0], y: p[i][1] }, b: { x: p[(i + 1) % 4][0], y: p[(i + 1) % 4][1] } });
    } else if (ch === "D" || ch === "L") {
      const portal = { kind: "door", state: ch === "L" ? "locked" : "closed" };
      const eastWest = !walkable(at(c, r - 1)) && !walkable(at(c, r + 1)); // walls above and below
      walls.push(eastWest
        ? { a: { x: x0 + CELL / 2, y: y0 }, b: { x: x0 + CELL / 2, y: y0 + CELL }, portal }
        : { a: { x: x0, y: y0 + CELL / 2 }, b: { x: x0 + CELL, y: y0 + CELL / 2 }, portal });
    }
  }
  return walls;
}

/* global document */
/** Runs in the browser: draws the whole map on a canvas and returns it as a PNG data URL. */
function drawInPage({ grid, cell, cols, rows }) {
  const W = cols * cell, H = rows * cell;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  let seed = 20260928;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const at = (c, r) => (grid[r] && grid[r][c]) || "#";
  const walk = (ch) => ch === "." || ch === "o" || ch === "D" || ch === "L";

  ctx.fillStyle = "#090a0d"; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.025})`; ctx.fillRect(rnd() * W, rnd() * H, 2, 2); }

  // Wall blocks: only those near walkable ground; deeper rock stays void.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (walk(at(c, r))) continue;
    let near = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (walk(at(c + dc, r + dr))) near = true;
    if (!near) continue;
    const x = c * cell, y = r * cell, v = (rnd() - 0.5) * 8;
    ctx.fillStyle = `rgb(${38 + v},${41 + v},${48 + v})`; ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = `rgb(${52 + v},${56 + v},${64 + v})`; ctx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(x + 4, y + 4, cell - 8, 3);
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 4, y + cell / 2); ctx.lineTo(x + cell - 4, y + cell / 2);
    const jx = x + cell * (0.3 + rnd() * 0.4); ctx.moveTo(jx, y + 4); ctx.lineTo(jx, y + cell / 2); ctx.stroke();
  }

  // Floor tiles.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!walk(at(c, r))) continue;
    const x = c * cell, y = r * cell, v = (rnd() - 0.5) * 14;
    ctx.fillStyle = `rgb(${104 + v},${109 + v},${118 + v})`; ctx.fillRect(x, y, cell, cell);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)"; ctx.fillRect(x + rnd() * cell, y + rnd() * cell, 2 + rnd() * 5, 2 + rnd() * 5); }
    if (rnd() < 0.12) {
      ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 1.2; ctx.beginPath();
      const sx = x + 10 + rnd() * 50, sy = y + 10 + rnd() * 50;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + (rnd() - 0.5) * 30, sy + (rnd() - 0.5) * 30); ctx.lineTo(sx + (rnd() - 0.5) * 40, sy + (rnd() - 0.5) * 40); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.30)"; ctx.lineWidth = 1.6; ctx.strokeRect(x + 0.8, y + 0.8, cell - 1.6, cell - 1.6);
    ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fillRect(x + 2, y + 2, cell - 4, 2);
  }

  // Soft shade along each wall face, inside the floor.
  const shade = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, "rgba(0,0,0,0.38)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  const S = 16;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!walk(at(c, r))) continue;
    const x = c * cell, y = r * cell;
    if (!walk(at(c, r - 1))) shade(x, y, x + cell, y + S, 0, y, 0, y + S);
    if (!walk(at(c, r + 1))) shade(x, y + cell - S, x + cell, y + cell, 0, y + cell, 0, y + cell - S);
    if (!walk(at(c - 1, r))) shade(x, y, x + S, y + cell, x, 0, x + S, 0);
    if (!walk(at(c + 1, r))) shade(x + cell - S, y, x + cell, y + cell, x + cell, 0, x + cell - S, 0);
  }

  // Windows: glazed strip set in the wall block.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (at(c, r) !== "w") continue;
    const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
    const horizontal = walk(at(c, r - 1)) && walk(at(c, r + 1)); // wall runs east-west
    ctx.save(); ctx.translate(cx, cy); if (!horizontal) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "#15171b"; ctx.fillRect(-29, -9, 58, 18);
    const g = ctx.createLinearGradient(-26, 0, 26, 0); g.addColorStop(0, "#9fc3d4"); g.addColorStop(0.5, "#d9edf5"); g.addColorStop(1, "#9fc3d4");
    ctx.fillStyle = g; ctx.fillRect(-26, -6, 52, 12);
    ctx.fillStyle = "#15171b"; ctx.fillRect(-1.5, -6, 3, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(-6, -3); ctx.moveTo(8, -3); ctx.lineTo(20, -3); ctx.stroke();
    ctx.restore();
  }

  // Pillars: round stone, inscribed in their square.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (at(c, r) !== "o") continue;
    const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(cx + 4, cy + 5, cell / 2, cell / 2, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, cell / 2);
    g.addColorStop(0, "#a2a7ae"); g.addColorStop(1, "#5d626b");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cell / 2 - 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2c2f35"; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, cell / 2 - 12, 0, Math.PI * 2); ctx.stroke();
  }

  // Doors: wooden leaf at the middle of the doorway; the locked one is banded in iron.
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = at(c, r);
    if (ch !== "D" && ch !== "L") continue;
    const locked = ch === "L";
    const cx = c * cell + cell / 2, cy = r * cell + cell / 2;
    const eastWest = !walk(at(c, r - 1)) && !walk(at(c, r + 1));
    ctx.save(); ctx.translate(cx, cy); if (eastWest) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-35, -6, 70, 18);
    ctx.fillStyle = locked ? "#4e3320" : "#7b5233"; ctx.fillRect(-35, -8, 70, 16);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.16)" : "rgba(255,220,160,0.10)"; ctx.fillRect(-35 + i * 10, -8, 10, 16); }
    ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 1; for (let i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-35 + i * 10, -8); ctx.lineTo(-35 + i * 10, 8); ctx.stroke(); }
    ctx.strokeStyle = "#241409"; ctx.lineWidth = 2; ctx.strokeRect(-35, -8, 70, 16);
    if (locked) {
      for (const bx of [-26, -6, 14]) { ctx.fillStyle = "#2b2e34"; ctx.fillRect(bx, -9, 7, 18); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(bx, -9, 7, 2); }
      ctx.fillStyle = "#1c1e22"; ctx.beginPath(); ctx.arc(26, 0, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8a8f97"; ctx.beginPath(); ctx.arc(26, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#2b2e34"; ctx.beginPath(); ctx.arc(24, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  return canvas.toDataURL("image/png");
}

const grid = buildGrid();
const walls = buildWalls(grid);
const W = COLS * CELL, H = ROWS * CELL;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(`(${drawInPage.toString()})(${JSON.stringify({ grid, cell: CELL, cols: COLS, rows: ROWS })})`);
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  await sharp(png).webp({ quality: 82 }).toFile(root("public/img/map-crypt.webp"));
  await sharp(png).resize(640, 384).webp({ quality: 80 }).toFile(root("public/img/home/sunken-crypt-thumb.webp"));

  const lines = walls.map((w) => {
    const color = w.portal ? (w.portal.state === "locked" ? "#ff00ff" : w.portal.kind === "window" ? "#00ffff" : "#ffff00") : "#ff0000";
    return `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${color}" stroke-width="3"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines.join("")}</svg>`;
  await mkdir(tmpdir(), { recursive: true });
  const overlay = join(tmpdir(), "sunken-crypt-walls-overlay.png");
  await sharp(png).composite([{ input: Buffer.from(svg) }]).png().toFile(overlay);
  console.log("overlay:", overlay);
} finally {
  await browser.close();
}

const pt = (p) => `{ x: ${p.x}, y: ${p.y} }`;
const body = walls.map((w) => `  { a: ${pt(w.a)}, b: ${pt(w.b)}${w.portal ? `, portal: { kind: "${w.portal.kind}", state: "${w.portal.state}" }` : ""} },`).join("\n");
await mkdir(fileURLToPath(new URL("../../../packages/shared/src/shippedWalls/", import.meta.url)), { recursive: true });
await writeFile(
  fileURLToPath(new URL("../../../packages/shared/src/shippedWalls/sunken-crypt.ts", import.meta.url)),
  `import type { StoredWall } from "../shippedMaps";\n\n/** Sunken Crypt's walls. Generated by apps/web/scripts/renderCryptMap.mjs from the layout that draws the map; do not edit by hand. */\nexport const SUNKEN_CRYPT_WALLS: readonly StoredWall[] = [\n${body}\n];\n`,
);
console.log("walls:", walls.length);
