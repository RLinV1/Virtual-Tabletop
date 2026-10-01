import { body, standardLabels, type BodyName } from "./diceGeometry";

/**
 * Image skins for your own dice (dice-image-skins).
 *
 * A dice look holds a picture per die type: the die's template painted a face per cell, or
 * one square picture that goes on every face. Each face shows its part of the picture clipped
 * to its outline; the die's shading lies over it and the app still prints the numerals, so a
 * look changes how a die looks, never what it reads.
 *
 * Every template is the same 1536 × 1024 canvas, a size image AIs produce readily, with a
 * grid of square cells sized for the die: faces numbered left to right, top to bottom.
 */

export const BODIES: BodyName[] = ["d4", "d6", "d8", "d10", "d12", "d20"];

/** One die type's picture in a dice look. */
export interface DiceSkinImage {
  /** The picture, re-encoded by the browser (a data URL). */
  href: string;
  width: number;
  height: number;
  /** `sheet`: the die's template, a face per cell. `single`: one square picture on every face. */
  layout: "sheet" | "single";
}

/** A named set of pictures, one per die type it covers; the rest keep the classic look. */
export interface DiceSkin {
  id: string;
  name: string;
  updatedAt: number;
  images: Partial<Record<BodyName, DiceSkinImage>>;
}

export const SHEET = { width: 1536, height: 1024 } as const;

const GRIDS: Record<BodyName, { columns: number; rows: number; cell: number }> = {
  d4: { columns: 2, rows: 2, cell: 512 },
  d6: { columns: 3, rows: 2, cell: 512 },
  d8: { columns: 4, rows: 2, cell: 384 },
  d10: { columns: 5, rows: 2, cell: 300 },
  d12: { columns: 4, rows: 3, cell: 340 },
  d20: { columns: 5, rows: 4, cell: 256 },
};

/** How much of its cell a face spans at its widest; the rest is bleed. */
const FACE_FILL = 0.875;


export interface TemplateSpec {
  body: BodyName;
  columns: number;
  rows: number;
  cell: number;
  /** Where the grid starts on the canvas; it is centred. */
  x0: number;
  y0: number;
  /** Canvas px per unit of die radius: every face of the die is drawn at this scale. */
  perUnit: number;
  /** How far the furthest face corner is from its face's centroid, in units of die radius. */
  reach: number;
  /**
   * Each face's centroid relative to the middle of its outline's bounding box, in units of die
   * radius: faces are centred in their cells by their outline, so a triangle doesn't sit high.
   */
  offsets: { u: number; v: number }[];
}

const specs = new Map<BodyName, TemplateSpec>();

export function templateSpec(name: BodyName): TemplateSpec {
  const cached = specs.get(name);
  if (cached) return cached;
  const { columns, rows, cell } = GRIDS[name];
  const faces = body(name).faces;
  const boxes = faces.map((f) => {
    const us = f.polygon.map(([u]) => u);
    const vs = f.polygon.map(([, v]) => v);
    return { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) };
  });
  // Every face at one scale: the widest outline spans the cell's face area.
  const span = Math.max(...boxes.map((b) => Math.max(b.maxU - b.minU, b.maxV - b.minV)));
  const spec = {
    body: name,
    columns,
    rows,
    cell,
    x0: (SHEET.width - columns * cell) / 2,
    y0: (SHEET.height - rows * cell) / 2,
    perUnit: (cell * FACE_FILL) / span,
    reach: Math.max(...faces.flatMap((f) => f.polygon.flatMap(([u, v]) => [Math.abs(u), Math.abs(v)]))),
    offsets: boxes.map((b) => ({ u: -(b.minU + b.maxU) / 2, v: -(b.minV + b.maxV) / 2 })),
  };
  specs.set(name, spec);
  return spec;
}

/**
 * The template cell (0-based) for a face of the body. Cells follow the numbers printed on a
 * standard die, so cell 1 is the face showing 1; a d4, whose numbers sit at its corners, takes
 * its faces in order.
 */
export function tileForFace(name: BodyName, faceIndex: number): number {
  if (name === "d4") return faceIndex;
  return standardLabels(body(name))[faceIndex]! - 1;
}

function faceForTile(name: BodyName, tile: number): number {
  if (name === "d4") return tile;
  return standardLabels(body(name)).indexOf(tile + 1);
}

function tileCentre(spec: TemplateSpec, tile: number) {
  const col = tile % spec.columns;
  const row = Math.floor(tile / spec.columns);
  return { x: spec.x0 + (col + 0.5) * spec.cell, y: spec.y0 + (row + 0.5) * spec.cell };
}

/** Where a face's centroid sits on the canvas: its cell's middle, moved so the outline is centred. */
function faceCentre(spec: TemplateSpec, faceIndex: number) {
  const c = tileCentre(spec, tileForFace(spec.body, faceIndex));
  const o = spec.offsets[faceIndex]!;
  return { x: c.x + o.u * spec.perUnit, y: c.y + o.v * spec.perUnit };
}

/** Which layout a picture is, from its proportions, or null when it is neither 3:2 nor square. */
export function skinLayoutFor(width: number, height: number): DiceSkinImage["layout"] | null {
  if (width <= 0 || height <= 0) return null;
  const near = (ratio: number) => Math.abs(width / height / ratio - 1) <= 0.02;
  if (near(SHEET.width / SHEET.height)) return "sheet";
  if (near(1)) return "single";
  return null;
}

const MAX_SIZE = { sheet: { width: SHEET.width, height: SHEET.height }, single: { width: 512, height: 512 } };

/** The size a picture is kept at: no bigger than its layout needs, proportions kept. */
export function keptSize(width: number, height: number, layout: DiceSkinImage["layout"]) {
  const max = MAX_SIZE[layout];
  const k = Math.min(1, max.width / width, max.height / height);
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

export const SKIN_FILE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_SKIN_FILE_BYTES = 5 * 1024 * 1024;

/** A face's art in the picture: its centre, and picture px per unit of die radius. */
export interface FaceArt {
  cx: number;
  cy: number;
  perUnit: number;
}

/** Where the art for one face of the body is in its picture. */
export function faceArt(image: Pick<DiceSkinImage, "width" | "height" | "layout">, name: BodyName, faceIndex: number): FaceArt {
  const spec = templateSpec(name);
  if (image.layout === "single") {
    const side = Math.min(image.width, image.height);
    // The whole square spans the die's widest face.
    return { cx: image.width / 2, cy: image.height / 2, perUnit: side / 2 / spec.reach };
  }
  // The template may come back scaled (an AI's 3072 × 2048, say); cells scale with it.
  const k = image.width / SHEET.width;
  const c = faceCentre(spec, faceIndex);
  return { cx: c.x * k, cy: c.y * k, perUnit: spec.perUnit * k };
}

/**
 * The SVG transform that lays the picture on a face drawn at `radius` px with its centroid at
 * (`cx`, `cy`) in the face's own pixels: the art's centre onto the face's, at the face's scale.
 * Faces and cells share the face's own axes (numeral upright), so there is no turn.
 */
export function faceImageTransform(art: FaceArt, face: { cx: number; cy: number; radius: number }): string {
  const k = face.radius / art.perUnit;
  return `translate(${face.cx} ${face.cy}) scale(${k}) translate(${-art.cx} ${-art.cy})`;
}

/** The numeral's font size, in units of die radius, as the renderer prints it (Die3D). */
const numeralSize = (room: number) => Math.min(room * 1.15, 0.62);

const FONT = `font-family="Helvetica, Arial, sans-serif"`;

/**
 * A die's template as an SVG: each cell with its face outline, the numbers where the app
 * prints them, the zones to keep calm under those numbers, and which way is up.
 */
export function templateSvg(name: BodyName): string {
  const spec = templateSpec(name);
  const b = body(name);
  const labels = name === "d4" ? [] : standardLabels(b);
  const u = spec.perUnit;
  const big = spec.cell >= 384;
  const cells = b.faces.map((_, tile) => {
    const j = faceForTile(name, tile);
    const f = b.faces[j]!;
    const cell = tileCentre(spec, tile);
    const x = cell.x - spec.cell / 2;
    const y = cell.y - spec.cell / 2;
    // Everything on the face is placed from its centroid, as the renderer places it.
    const c = faceCentre(spec, j);
    const at = (pu: number, pv: number) => `${(c.x + pu * u).toFixed(1)},${(c.y + pv * u).toFixed(1)}`;
    const parts: string[] = [
      `<rect x="${x + 1}" y="${y + 1}" width="${spec.cell - 2}" height="${spec.cell - 2}" fill="#e7e3da" stroke="#b8b2a6" stroke-width="2" stroke-dasharray="10 8"/>`,
      `<polygon points="${f.polygon.map(([pu, pv]) => at(pu, pv)).join(" ")}" fill="#ffffff" stroke="#1b1f24" stroke-width="${big ? 4 : 3}" stroke-linejoin="round"/>`,
    ];
    let caption: string;
    if (name === "d4") {
      // The number at each corner, turned to point at it, as the die prints them.
      const size = numeralSize(f.inradius * 0.75) * u;
      f.polygon.forEach(([pu, pv], k) => {
        const px = c.x + pu * 0.52 * u;
        const py = c.y + pv * 0.52 * u;
        const angle = (Math.atan2(pu, -pv) * 180) / Math.PI;
        parts.push(
          `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(size * 0.62).toFixed(1)}" fill="none" stroke="#b9582f" stroke-width="3" stroke-dasharray="10 7"/>`,
          `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" transform="rotate(${angle.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" font-size="${size.toFixed(1)}" font-weight="700" fill="#cfc9bd" text-anchor="middle" dominant-baseline="central" ${FONT}>${f.corners[k]! + 1}</text>`,
        );
      });
      caption = `d4 · face ${tile + 1} (corners ${f.corners.map((k) => k + 1).join(", ")})`;
    } else {
      const value = labels[j]!;
      const size = numeralSize(f.inradius) * u;
      const digits = String(value).length;
      const zone = { w: size * (0.6 * digits + 0.25), h: size * 0.95 };
      const arrowY = c.y - zone.h / 2 - Math.max(8, 0.04 * u);
      const a = Math.max(8, 0.05 * u);
      parts.push(
        `<rect x="${(c.x - zone.w / 2).toFixed(1)}" y="${(c.y - zone.h / 2).toFixed(1)}" width="${zone.w.toFixed(1)}" height="${zone.h.toFixed(1)}" rx="${(size * 0.12).toFixed(1)}" fill="none" stroke="#b9582f" stroke-width="3" stroke-dasharray="10 7"/>`,
        `<text x="${c.x}" y="${c.y}" font-size="${size.toFixed(1)}" font-weight="700" fill="#cfc9bd" text-anchor="middle" dominant-baseline="central" ${FONT}>${value}</text>`,
        `<path d="M ${c.x} ${(arrowY - a).toFixed(1)} l ${(a * 0.75).toFixed(1)} ${a.toFixed(1)} h ${(-a * 1.5).toFixed(1)} z" fill="#1b1f24"/>`,
      );
      caption = `${name} · face ${value}`;
    }
    parts.push(`<text x="${x + 10}" y="${y + (big ? 22 : 18)}" font-size="${big ? 16 : 13}" fill="#6d675c" ${FONT}>${caption}</text>`);
    return `  <g>\n    ${parts.join("\n    ")}\n  </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.width}" height="${SHEET.height}" viewBox="0 0 ${SHEET.width} ${SHEET.height}">
  <rect width="${SHEET.width}" height="${SHEET.height}" fill="#d9d4c9"/>
${cells.join("\n")}
</svg>
`;
}

/**
 * What to tell an image AI to paint a look: the die's template attached (its grid, numbering
 * and outlines are all in the picture), or nothing attached for one square picture that goes
 * on every face of every die.
 */
export const DICE_PROMPT = `Paint a skin for a die, for a virtual tabletop.

If a die template is attached (a ${SHEET.width} × ${SHEET.height} sheet of cells, one outlined face per cell):
- Output one PNG of exactly ${SHEET.width} × ${SHEET.height} px that keeps the template's layout exactly: the same grid of cells in the same places, one face per cell, in the template's order.
- The outlined shape in each cell is the visible face. Paint the whole cell anyway, because everything around the outline is bleed. The top of each cell is the top of the face.
- Keep the areas marked with dashed boxes (or dashed circles, on a d4) calm, with an even tone and no fine detail or hard edges: the app prints each face's number there, in white with a dark outline.
- Make the faces one set: the same material, palette and style, with a different motif per face if you like. Don't rely on a pattern continuing from one cell into the next.

If no template is attached, paint one seamless square texture, 1024 × 1024 px, which the app puts on every face of every die. Keep its centre calm, because each face's number goes there.

Either way, do not draw:
- any numbers, pips, letters, text or symbols meant to be read;
- the template's guide lines, labels, arrows, circles or grey numbers;
- shadows, perspective or a 3D die. Paint flat, lit evenly, seen straight on: the app adds the shading.

Style: [describe it here, e.g. "polished obsidian with thin gold veins and a gold border along each edge"].`;
