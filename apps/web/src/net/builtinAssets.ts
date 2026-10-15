import { SHIPPED_MAPS, type LibraryAsset } from "@vtt/shared";

/**
 * Token art and maps that ship with the app (builtin-library-assets).
 *
 * Token art is not a library row: nobody owns it, nobody can rename or delete it, and placing
 * one records only its URL in the room, never an `assetId`. Maps are seeded into each account's
 * library as real rows (ADR 0036); the map entries here serve signed-out pages only. The files
 * are served by the web origin from `public/img/`; keep the names stable, since rooms store these URLs.
 */

const SHIPPED = "2026-09-24T00:00:00.000Z";
const TOKEN_SIZE = { width: 192, height: 192 };

/**
 * Each map carries its own grid, measured from its drawn floor tiles so the lines follow
 * the paving and walls (top-down-default-maps). A regenerated map needs measuring again.
 */
function token(slug: string, name: string, url: string): LibraryAsset {
  return { id: `builtin:${slug}`, kind: "token", name, url, ...TOKEN_SIZE, grid: null, createdAt: SHIPPED };
}

export const BUILTIN_ASSETS: readonly LibraryAsset[] = [
  ...SHIPPED_MAPS.map(
    ({ slug, name, url, width, height, grid }): LibraryAsset => ({ id: `builtin:${slug}`, kind: "map", name, url, width, height, grid, createdAt: SHIPPED }),
  ),
  token("brenna", "Brenna", "/img/tokens/hero-brenna.webp"),
  token("toma", "Toma", "/img/tokens/hero-toma.webp"),
  token("ash", "Ash", "/img/tokens/hero-ash.webp"),
  token("nalani", "Nalani", "/img/tokens/jungle-brenna.webp"),
  token("kaveh", "Kaveh", "/img/tokens/jungle-toma.webp"),
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
