import { describe, expect, it } from "vitest";
import { body, labelDie } from "../src/ui/diceGeometry";
import { layoutDice } from "../src/ui/Die3D";
import { BODIES, DICE_PROMPT, faceArt, faceImageTransform, keptSize, SHEET, skinLayoutFor, templateSpec, templateSvg, tileForFace } from "../src/ui/diceSkin";

const SIDES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 } as const;

/** Applies an SVG `translate(a b) scale(k) translate(c d)` to a point. */
function applyTransform(transform: string, p: { x: number; y: number }) {
  const [a, b, k, c, d] = transform.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!.map(Number) as [number, number, number, number, number];
  return { x: a + k * (p.x + c), y: b + k * (p.y + d) };
}

const sheet = { width: SHEET.width, height: SHEET.height, layout: "sheet" as const };

describe("dice image skins (dice-image-skins, FR-TAC-09)", () => {
  it("tells a template from a square picture, and rejects other shapes", () => {
    expect(skinLayoutFor(1536, 1024)).toBe("sheet");
    expect(skinLayoutFor(3072, 2048)).toBe("sheet");
    expect(skinLayoutFor(1024, 1024)).toBe("single");
    expect(skinLayoutFor(1920, 1080)).toBeNull();
    expect(skinLayoutFor(0, 10)).toBeNull();
  });

  it("keeps pictures no bigger than their layout needs", () => {
    expect(keptSize(3072, 2048, "sheet")).toEqual({ width: 1536, height: 1024 });
    expect(keptSize(800, 800, "single")).toEqual({ width: 512, height: 512 });
    expect(keptSize(300, 300, "single")).toEqual({ width: 300, height: 300 });
  });

  it("keeps the d6 template the prototype used: 3 × 2 cells of 512, faces 1–6 in order", () => {
    const spec = templateSpec("d6");
    expect(spec).toMatchObject({ columns: 3, rows: 2, cell: 512, x0: 0, y0: 0 });
    const d6 = body("d6");
    const centre = (value: number) => faceArt(sheet, "d6", d6.faces.findIndex((_, j) => tileForFace("d6", j) === value - 1));
    expect(centre(1)).toMatchObject({ cx: 256, cy: 256 });
    expect(centre(3)).toMatchObject({ cx: 1280, cy: 256 });
    expect(centre(4)).toMatchObject({ cx: 256, cy: 768 });
    expect(centre(6)).toMatchObject({ cx: 1280, cy: 768 });
  });

  describe.each(BODIES)("the %s template", (name) => {
    const spec = templateSpec(name);
    const b = body(name);

    it("fits its grid on the 1536 × 1024 canvas", () => {
      expect(spec.x0).toBeGreaterThanOrEqual(0);
      expect(spec.y0).toBeGreaterThanOrEqual(0);
      expect(spec.x0 * 2 + spec.columns * spec.cell).toBeCloseTo(SHEET.width);
      expect(spec.y0 * 2 + spec.rows * spec.cell).toBeCloseTo(SHEET.height);
      expect(spec.columns * spec.rows).toBeGreaterThanOrEqual(b.faces.length);
    });

    it("gives every face its own cell", () => {
      const tiles = b.faces.map((_, j) => tileForFace(name, j)).sort((x, y) => x - y);
      expect(tiles).toEqual(b.faces.map((_, i) => i));
    });

    it("keeps every face outline inside its cell, centred", () => {
      b.faces.forEach((f, j) => {
        const art = faceArt(sheet, name, j);
        const tile = tileForFace(name, j);
        const left = spec.x0 + (tile % spec.columns) * spec.cell;
        const top = spec.y0 + Math.floor(tile / spec.columns) * spec.cell;
        const xs = f.polygon.map(([u]) => art.cx + u * art.perUnit);
        const ys = f.polygon.map(([, v]) => art.cy + v * art.perUnit);
        expect(Math.min(...xs)).toBeGreaterThan(left);
        expect(Math.max(...xs)).toBeLessThan(left + spec.cell);
        expect(Math.min(...ys)).toBeGreaterThan(top);
        expect(Math.max(...ys)).toBeLessThan(top + spec.cell);
        // The outline's box is centred in the cell.
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(left + spec.cell / 2);
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(top + spec.cell / 2);
      });
    });

    it("lays each cell's face exactly onto its face on the die", () => {
      const [die] = layoutDice({ id: `skin-${name}`, sides: SIDES[name], dice: [1] }, 60);
      die!.faces.forEach((face, j) => {
        const art = faceArt(sheet, name, j);
        const t = faceImageTransform(art, { cx: face.labelX, cy: face.labelY, radius: die!.radius });
        for (const [u, v] of b.faces[j]!.polygon) {
          // The corner as drawn in the template cell lands on the same corner of the face.
          const p = applyTransform(t, { x: art.cx + u * art.perUnit, y: art.cy + v * art.perUnit });
          expect(p.x).toBeCloseTo(face.labelX + u * die!.radius);
          expect(p.y).toBeCloseTo(face.labelY + v * die!.radius);
        }
      });
    });

    it("draws every face on the canvas the prompt asks for", () => {
      const svg = templateSvg(name);
      expect(svg.match(/<polygon /g)).toHaveLength(b.faces.length);
      expect(svg).toContain(`width="${SHEET.width}" height="${SHEET.height}"`);
      expect(DICE_PROMPT).toContain(`${SHEET.width} × ${SHEET.height} px`);
    });
  });

  it("numbers template cells by the faces of a standard die", () => {
    // Cell 20 of the d20 template is the face that shows 20 when a d20 rolls 20.
    const rolled = labelDie(20, 20);
    expect(tileForFace("d20", rolled.front)).toBe(19);
  });

  it("puts a square picture whole on every face", () => {
    const art = faceArt({ width: 512, height: 512, layout: "single" }, "d6", 2);
    const reach = templateSpec("d6").reach;
    const t = faceImageTransform(art, { cx: 40, cy: 40, radius: 30 });
    expect(applyTransform(t, { x: 0, y: 0 }).x).toBeCloseTo(40 - reach * 30);
    expect(applyTransform(t, { x: 512, y: 512 }).y).toBeCloseTo(40 + reach * 30);
  });
});
