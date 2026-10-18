import { describe, expect, it } from "vitest";
import { LibraryMapBoard, libraryBoardProblem } from "../src";

const map = { width: 1000, height: 800 };
const square = [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }];

describe("a library map's prepared walls and fog (asset-library, ADR 0037)", () => {
  it("accepts walls and fog that lie on the map", () => {
    const board = LibraryMapBoard.parse({
      walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, portal: { kind: "door", state: "closed" } }],
      fog: [{ shape: "rect", points: square }],
    });
    expect(libraryBoardProblem(board, map)).toBeNull();
  });

  it("refuses extra fields, ids and out-of-range counts", () => {
    expect(LibraryMapBoard.safeParse({ walls: [], fog: [], extra: 1 }).success).toBe(false);
    expect(LibraryMapBoard.safeParse({ walls: [{ id: "x", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }], fog: [] }).success).toBe(false);
    expect(LibraryMapBoard.safeParse({ walls: Array.from({ length: 1501 }, () => ({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } })), fog: [] }).success).toBe(false);
  });

  it("names why a board does not fit the map", () => {
    const wall = (b: { x: number; y: number }) => LibraryMapBoard.parse({ walls: [{ a: { x: 0, y: 0 }, b }], fog: [] });
    expect(libraryBoardProblem(wall({ x: 0, y: 0 }), map)).toMatch(/two different ends/);
    expect(libraryBoardProblem(wall({ x: 2000, y: 0 }), map)).toMatch(/lie on the map/);
    const fog = (points: { x: number; y: number }[]) => LibraryMapBoard.parse({ walls: [], fog: [{ shape: "polygon", points }] });
    expect(libraryBoardProblem(fog(square.map((p) => ({ x: p.x + 5000, y: p.y }))), map)).toMatch(/Fog must lie/);
    expect(libraryBoardProblem(fog([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]), map)).toMatch(/some area/);
  });
});
