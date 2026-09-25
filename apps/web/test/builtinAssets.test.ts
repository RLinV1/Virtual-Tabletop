import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_GRID, type LibraryAsset } from "@vtt/shared";
import { BUILTIN_ASSETS, builtinsMatching, isBuiltin, libraryAssetId } from "../src/net/builtinAssets";

describe("built-in library assets (builtin-library-assets)", () => {
  it("ships three maps and five tokens with unique built-in ids", () => {
    expect(BUILTIN_ASSETS.filter((a) => a.kind === "map")).toHaveLength(3);
    expect(BUILTIN_ASSETS.filter((a) => a.kind === "token")).toHaveLength(5);
    const ids = BUILTIN_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BUILTIN_ASSETS) expect(isBuiltin(a)).toBe(true);
  });

  it("gives each map its own measured size and grid, and tokens none (top-down-default-maps)", () => {
    const maps = Object.fromEntries(BUILTIN_ASSETS.filter((a) => a.kind === "map").map((a) => [a.name, a]));
    const expected = {
      "The Broken Span": { width: 3344, height: 1882, cellSize: 69.4, offsetX: 10, offsetY: 31 },
      "Hollowfrost Keep": { width: 3269, height: 1882, cellSize: 70, offsetX: 47, offsetY: 46 },
      "Temple of the Green Sun": { width: 2740, height: 1604, cellSize: 70, offsetX: 21, offsetY: 36 },
    };
    for (const [name, e] of Object.entries(expected)) {
      const m = maps[name]!;
      expect({ width: m.width, height: m.height }).toEqual({ width: e.width, height: e.height });
      expect(m.grid).toEqual({ ...DEFAULT_GRID, cellSize: e.cellSize, offsetX: e.offsetX, offsetY: e.offsetY });
      // Usable as a table map at about 70 px per square.
      expect(m.width).toBeGreaterThanOrEqual(2600);
      // The grid schema requires 0 <= offset < cellSize.
      expect(m.grid!.offsetX).toBeLessThan(m.grid!.cellSize);
      expect(m.grid!.offsetY).toBeLessThan(m.grid!.cellSize);
    }
    for (const t of BUILTIN_ASSETS.filter((a) => a.kind === "token")) expect(t.grid).toBeNull();
  });

  it("points at files that exist in the web app's public folder", () => {
    for (const a of BUILTIN_ASSETS) {
      expect(existsSync(fileURLToPath(new URL(`../public${a.url}`, import.meta.url)))).toBe(true);
    }
  });

  it("records no library asset id for a built-in, and the row id for an upload", () => {
    const upload: LibraryAsset = { ...BUILTIN_ASSETS[0]!, id: "0b6f8a5e-5c1e-4f55-9d57-2f4a4b8c9d10" };
    expect(libraryAssetId(BUILTIN_ASSETS[0]!)).toBeNull();
    expect(libraryAssetId(upload)).toBe(upload.id);
  });

  it("filters by kind and a case-insensitive name search", () => {
    expect(builtinsMatching("map", "FROST").map((a) => a.name)).toEqual(["Hollowfrost Keep"]);
    expect(builtinsMatching("token", "").every((a) => a.kind === "token")).toBe(true);
  });
});
