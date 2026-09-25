import { DEFAULT_GRID, type LibraryAsset } from "@vtt/shared";

/**
 * Maps and token art that ship with the app (builtin-library-assets).
 *
 * Every GM's library and pickers list these after their own uploads. They are not library
 * rows: nobody owns them, nobody can rename or delete them, and placing one records only
 * its URL in the room, never an `assetId`. The files are served by the web origin from
 * `public/img/`; keep the names stable, since rooms store these URLs.
 */

const SHIPPED = "2026-09-24T00:00:00.000Z";
const TOKEN_SIZE = { width: 192, height: 192 };

/**
 * Each map carries its own grid, measured from its drawn floor tiles so the lines follow
 * the paving and walls (top-down-default-maps). A regenerated map needs measuring again.
 */
function map(
  slug: string,
  name: string,
  url: string,
  size: { width: number; height: number },
  grid: { cellSize: number; offsetX: number; offsetY: number },
): LibraryAsset {
  return { id: `builtin:${slug}`, kind: "map", name, url, ...size, grid: { ...DEFAULT_GRID, ...grid }, createdAt: SHIPPED };
}

function token(slug: string, name: string, url: string): LibraryAsset {
  return { id: `builtin:${slug}`, kind: "token", name, url, ...TOKEN_SIZE, grid: null, createdAt: SHIPPED };
}

export const BUILTIN_ASSETS: readonly LibraryAsset[] = [
  map("broken-span", "The Broken Span", "/img/hero-map.webp", { width: 3344, height: 1882 }, { cellSize: 69.4, offsetX: 10, offsetY: 31 }),
  map("hollowfrost-keep", "Hollowfrost Keep", "/img/map-ice.webp", { width: 3269, height: 1882 }, { cellSize: 70, offsetX: 47, offsetY: 46 }),
  map("temple-green-sun", "Temple of the Green Sun", "/img/map-jungle.webp", { width: 2740, height: 1604 }, { cellSize: 70, offsetX: 21, offsetY: 36 }),
  token("brenna", "Brenna", "/img/tokens/hero-brenna.webp"),
  token("toma", "Toma", "/img/tokens/hero-toma.webp"),
  token("ash", "Ash", "/img/tokens/hero-ash.webp"),
  token("brenna-jungle", "Brenna (jungle)", "/img/tokens/jungle-brenna.webp"),
  token("toma-jungle", "Toma (jungle)", "/img/tokens/jungle-toma.webp"),
];

export function isBuiltin(asset: LibraryAsset): boolean {
  return asset.id.startsWith("builtin:");
}

/** The id a room records for a placed asset: none for a built-in, which is not a library row. */
export function libraryAssetId(asset: LibraryAsset): string | null {
  return isBuiltin(asset) ? null : asset.id;
}

/** Built-ins of one kind whose name matches a search, in catalog order. */
export function builtinsMatching(kind: LibraryAsset["kind"], query: string): LibraryAsset[] {
  const q = query.trim().toLowerCase();
  return BUILTIN_ASSETS.filter((a) => a.kind === kind && (!q || a.name.toLowerCase().includes(q)));
}
