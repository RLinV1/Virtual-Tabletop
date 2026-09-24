import { describe, expect, it } from "vitest";
import { apply, body, bodyFor, dot, faceLayout, labelDie, type BodyName, type Vec3 } from "../src/ui/diceGeometry";

const STANDARD: [BodyName, number, number][] = [
  // name, faces, corners per face
  ["d4", 4, 3],
  ["d6", 6, 4],
  ["d8", 8, 3],
  ["d10", 10, 4],
  ["d12", 12, 5],
  ["d20", 20, 3],
];

const close = (a: readonly number[], b: readonly number[], digits = 6) =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, digits));

/** Every numeral on a die, with how far toward the viewer it sits once the die is at rest. */
function numeralsAtRest(sides: number, value: number, pick = 0) {
  const die = labelDie(sides, value, pick);
  return die.body.faces.flatMap((f, j) =>
    die.numerals[j]!.map((m) => {
      const at = (k: 0 | 1 | 2) => f.c[k] + m.u * f.u[k] + m.v * f.v[k];
      const p: Vec3 = [at(0), at(1), at(2)];
      return { value: m.value, z: apply(die.rest, p)[2] };
    }),
  );
}

describe("3D dice geometry (FR-TAC-09)", () => {
  it.each(STANDARD)("builds a %s with %i faces of %i corners", (name, faces, corners) => {
    const b = body(name);
    expect(b.faces).toHaveLength(faces);
    for (const f of b.faces) {
      expect(f.polygon).toHaveLength(corners);
      expect(new Set(f.corners).size).toBe(corners);
    }
  });

  it.each(STANDARD)("gives every %s face an outward, right-handed frame", (name) => {
    for (const f of body(name).faces) {
      expect(dot(f.n, f.c)).toBeGreaterThan(0);
      expect(dot(f.u, f.v)).toBeCloseTo(0, 6);
      // u × v = n, or the numeral would render mirrored and back-face culling would invert.
      const [u, v] = [f.u, f.v];
      close([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], f.n);
      expect(f.inradius).toBeGreaterThan(0.1);
    }
  });

  it.each(STANDARD.filter(([n]) => n !== "d4"))(
    "numbers a %s 1 to N, opposite faces summing like a real die",
    (_name, faces) => {
      const d = labelDie(faces, 1);
      const labels = d.numerals.map((ms) => ms[0]!.value);
      expect([...labels].sort((a, b) => a - b)).toEqual(Array.from({ length: faces }, (_, i) => i + 1));
      d.body.opposite.forEach((o, i) => {
        if (o >= 0) expect(labels[i]! + labels[o]!).toBe(faces + 1);
      });
    },
  );

  it("lands every standard die with its result face forward and upright", () => {
    for (const [name, faces] of STANDARD.filter(([n]) => n !== "d4")) {
      for (let value = 1; value <= faces; value++) {
        const d = labelDie(faces, value);
        expect(d.body.name).toBe(name);
        const face = d.body.faces[d.front]!;
        expect(d.numerals[d.front]![0]!.value).toBe(value);
        close(apply(d.rest, face.n), [0, 0, 1]);
        close(apply(d.rest, face.v), [0, 1, 0]);
      }
    }
  });

  it("reads a d4 at its top corner, printed on all three faces that meet there", () => {
    for (let value = 1; value <= 4; value++) {
      const d = labelDie(4, value);
      expect(d.front).toBe(-1);
      // The result corner is the top of the pyramid on screen (y points down).
      const ys = d.body.vertices.map((p) => apply(d.rest, p)[1]);
      expect(Math.min(...ys)).toBe(ys[value - 1]);
      const top = numeralsAtRest(4, value).sort((a, b) => b.z - a.z);
      expect(top.slice(0, 3).map((m) => m.value)).toEqual([value, value, value]);
      expect(top[3]!.z).toBeLessThan(top[2]!.z - 1e-3);
    }
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 20, 100, 1000])(
    "shows the rolled value nearest the viewer on a d%i",
    (sides) => {
      for (const value of new Set([1, Math.ceil(sides / 2), sides])) {
        for (const pick of [0, 1, 5]) {
          const shown = numeralsAtRest(sides, value, pick);
          const nearest = Math.max(...shown.map((m) => m.z));
          for (const m of shown.filter((m) => m.z > nearest - 1e-6)) expect(m.value).toBe(value);
          for (const m of shown) {
            expect(m.value).toBeGreaterThanOrEqual(1);
            expect(m.value).toBeLessThanOrEqual(sides);
          }
        }
      }
    },
  );

  it("draws a d2 and d3 as a d6, other odd dice on the next body up, and a d20 past twenty", () => {
    expect(bodyFor(2).name).toBe("d6");
    expect(bodyFor(3).name).toBe("d6");
    expect(bodyFor(4).name).toBe("d4");
    expect(bodyFor(5).name).toBe("d6");
    expect(bodyFor(7).name).toBe("d8");
    expect(bodyFor(13).name).toBe("d20");
    expect(bodyFor(100).name).toBe("d20");
  });

  it("puts the face element's corner so the centroid lands on the face centre", () => {
    const face = body("d20").faces[0]!;
    const r = 30;
    const layout = faceLayout(face, r);
    const m = /matrix3d\(([^)]+)\)/.exec(layout.transform)![1]!.split(",").map(Number);
    // Column-major: columns 0..2 are u, v, n; column 3 is the translation.
    const at = (x: number, y: number) => [0, 1, 2].map((k) => m[k]! * x + m[4 + k]! * y + m[12 + k]!);
    // The CSS is printed to six decimals, so compare to a thousandth of a pixel.
    close(at(layout.labelX, layout.labelY), [face.c[0] * r, face.c[1] * r, face.c[2] * r], 3);
  });
});
