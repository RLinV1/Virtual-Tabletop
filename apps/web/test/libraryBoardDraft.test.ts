import { describe, expect, it } from "vitest";
import { LibraryMapBoard } from "@vtt/shared";
import { boardChanged, boardFromDraft, commandsForBoard, draftFromBoard } from "../src/pages/mapEditor/libraryBoardDraft";

const board: LibraryMapBoard = {
  walls: [{ a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }, { a: { x: 50, y: 0 }, b: { x: 50, y: 50 }, portal: { kind: "door", state: "open" } }],
  fog: [{ shape: "rect", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }],
};

describe("a library map's board draft (asset-library, ADR 0037)", () => {
  it("preserves UVTT metadata from full wall edits through storage and room copy commands", () => {
    const imported: LibraryMapBoard = { walls: [{ ...board.walls[0]!, source: "objects_line_of_sight", uvttPortal: { position: { x: 9, y: 12 }, rotation: 0, closed: false, freestanding: true } }], fog: [] };
    const draft = draftFromBoard("/uploads/m.png", imported);
    const stored = LibraryMapBoard.parse(boardFromDraft(draft));
    expect(stored).toEqual(imported);
    expect(boardChanged(draft, stored)).toBe(false);
    expect(commandsForBoard(stored, draft.mapUrl)).toEqual([{ type: "wall.add", expectedMapUrl: draft.mapUrl, walls: imported.walls }]);
  });
  it("round-trips a stored board, dropping the ids it made", () => {
    const draft = draftFromBoard("/uploads/m.png", board);
    expect(Object.keys(draft.walls).every((id) => id.startsWith("draft:"))).toBe(true);
    expect(boardFromDraft(draft)).toEqual(board);
    expect(boardChanged(draft, board)).toBe(false);
  });

  it("notices an added, removed or changed wall, but not a reordering", () => {
    const draft = draftFromBoard("/uploads/m.png", board);
    const reordered = { ...board, walls: [...board.walls].reverse() };
    expect(boardChanged(draft, reordered)).toBe(false);
    const [firstId] = Object.keys(draft.walls);
    const { [firstId!]: _gone, ...rest } = draft.walls;
    expect(boardChanged({ ...draft, walls: rest }, board)).toBe(true);
    expect(boardChanged({ ...draft, fog: {} }, board)).toBe(true);
  });
});

describe("adding a library map's board to a room (asset-library, ADR 0037)", () => {
  it("only appends: no wall is removed or cleared and no fog is removed", () => {
    const commands = commandsForBoard(board, "/uploads/m.png");
    expect(commands.map((c) => c.type)).toEqual(["wall.add", "fog.replace"]);
    expect(commands[1]).toMatchObject({ removeIds: [], add: [{ shape: "rect", from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }] });
    expect(commands.every((c) => "expectedMapUrl" in c && c.expectedMapUrl === "/uploads/m.png")).toBe(true);
  });

  it("splits many walls into batches the room accepts", () => {
    const many: LibraryMapBoard = { walls: Array.from({ length: 120 }, (_, i) => ({ a: { x: i, y: 0 }, b: { x: i, y: 9 } })), fog: [] };
    const commands = commandsForBoard(many, "/uploads/m.png");
    expect(commands.map((c) => (c.type === "wall.add" ? c.walls.length : 0))).toEqual([50, 50, 20]);
  });
});
