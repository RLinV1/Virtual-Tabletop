import { isSnapped, placementCandidates, type GridSpec, type Point } from "./geometry";

export const MAP_TOKEN_POLICIES = ["scale", "keep", "recenter"] as const;
export type MapTokenPolicy = (typeof MAP_TOKEN_POLICIES)[number];

export interface TokenPositionChange {
  tokenId: string;
  from: Point;
  to: Point;
}

type Dimensions = { width: number; height: number };
type PlacedToken = { id: string; position: Point; size: number };
export type MapTokenAdjustment =
  | { ok: true; changes: TokenPositionChange[] }
  | { ok: false; tokenId: string; footprint: number };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Nearest lattice point within footprint bounds, or bounds alone when the lattice cannot fit. */
function boundedAxis(value: number, half: number, extent: number, phase: number, cell: number, aligned: boolean): number {
  const max = extent - half;
  if (!aligned) return clamp(value, half, max);
  const first = Math.ceil((half - phase) / cell);
  const last = Math.floor((max - phase) / cell);
  if (first > last) return clamp(value, half, max);
  const index = clamp(Math.round((value - phase) / cell), first, last);
  // Protect the footprint from floating-point noise at the image edge.
  return clamp(index * cell + phase, half, max);
}

/** Pure adjustment: validates all footprints before calculating any position. */
export function adjustMapTokens(
  tokens: readonly PlacedToken[],
  previousMap: Dimensions | null,
  map: Dimensions,
  previousGrid: GridSpec,
  grid: GridSpec,
  policy: MapTokenPolicy = "scale",
): MapTokenAdjustment {
  const ordered = [...tokens].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const token of ordered) {
    const footprint = token.size * grid.cellSize;
    if (footprint > map.width || footprint > map.height) return { ok: false, tokenId: token.id, footprint };
  }

  const changes: TokenPositionChange[] = [];
  const placed: Array<{ position: Point; half: number }> = [];
  for (const token of ordered) {
    const side = token.size * grid.cellSize;
    const half = side / 2;
    const aligned = isSnapped(token.position, token.size, previousGrid);
    const phase = token.size % 2 === 1 ? grid.cellSize / 2 : 0;
    const bounded = (p: Point): Point => ({
      x: boundedAxis(p.x, half, map.width, grid.offsetX + phase, grid.cellSize, aligned),
      y: boundedAxis(p.y, half, map.height, grid.offsetY + phase, grid.cellSize, aligned),
    });
    let to: Point;
    if (previousMap && policy === "recenter") {
      const center = bounded({ x: map.width / 2, y: map.height / 2 });
      to = center;
      for (const candidate of placementCandidates(center, side, map)) {
        if (candidate.x < half || candidate.x > map.width - half || candidate.y < half || candidate.y > map.height - half) continue;
        const p = bounded(candidate);
        if (placed.some((other) => Math.abs(other.position.x - p.x) < other.half + half && Math.abs(other.position.y - p.y) < other.half + half)) continue;
        to = p;
        break;
      }
      placed.push({ position: to, half });
    } else {
      const candidate = previousMap && policy === "scale"
        ? { x: token.position.x * (map.width / previousMap.width), y: token.position.y * (map.height / previousMap.height) }
        : token.position;
      to = bounded(candidate);
    }
    if (to.x !== token.position.x || to.y !== token.position.y) changes.push({ tokenId: token.id, from: token.position, to });
  }
  return { ok: true, changes };
}
