import { DEFAULT_GRID, type GridSpec } from "./geometry";

/**
 * The maps that ship with the app (builtin-library-assets, ADR 0036). Each account's library gets
 * them as rows; the files are served by the web origin from `public/img/`, so keep the URLs stable,
 * since rooms store them. Each grid is measured from the drawn floor tiles so the lines follow the
 * paving and walls (top-down-default-maps). A regenerated map needs measuring again.
 */
export interface ShippedMap {
  slug: string;
  name: string;
  url: string;
  width: number;
  height: number;
  grid: GridSpec;
}

function shipped(
  slug: string,
  name: string,
  url: string,
  size: { width: number; height: number },
  grid: { cellSize: number; offsetX: number; offsetY: number },
): ShippedMap {
  return { slug, name, url, ...size, grid: { ...DEFAULT_GRID, ...grid } };
}

export const SHIPPED_MAPS: readonly ShippedMap[] = [
  shipped("broken-span", "The Broken Span", "/img/hero-map.webp", { width: 3344, height: 1882 }, { cellSize: 69.4, offsetX: 10, offsetY: 31 }),
  shipped("hollowfrost-keep", "Hollowfrost Keep", "/img/map-ice.webp", { width: 3269, height: 1882 }, { cellSize: 70, offsetX: 47, offsetY: 46 }),
  shipped("temple-green-sun", "Temple of the Green Sun", "/img/map-jungle.webp", { width: 2740, height: 1604 }, { cellSize: 70, offsetX: 21, offsetY: 36 }),
];

export function shippedMapByUrl(url: string): ShippedMap | undefined {
  return SHIPPED_MAPS.find((m) => m.url === url);
}
