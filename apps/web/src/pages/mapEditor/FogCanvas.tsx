import { useEffect, useState } from "react";
import { MAX_FOG_POINTS, type Command, type FogRegion, type GridSpec, type MapImage, type Point } from "@vtt/shared";
import { fogRegionAt } from "../../board/tools";
import { MapCanvas } from "./MapCanvas";

/** A polygon closes when a click lands this close to its first corner, in screen pixels. */
const CLOSE_PX = 12;

/** Drag a rectangle, click out a polygon, click a region to reveal it, or pan. */
export type FogCanvasMode = "rect" | "polygon" | "reveal" | "pan";
export type FogAdd = Extract<Command, { type: "fog.add" }>["region"];

const clamp = (p: Point, map: MapImage): Point => ({
  x: Math.min(map.width, Math.max(0, p.x)),
  y: Math.min(map.height, Math.max(0, p.y)),
});

/**
 * The Fog step's canvas (map-editor D4): the map with its fog as the GM sees it, in board
 * coordinates (invariant 8). Rectangle drags out a region, Polygon clicks out its corners, and
 * Reveal removes the topmost region under the click.
 */
/** Fog as players see it: opaque, in the grey of the board's cloud fog (board/fogTexture.ts). */
const PLAYER_FOG = "#c4c9ce";

export function FogCanvas({ map, grid, fog, mode, onAdd, onRemove, onNotice, busy, playerView = false }: {
  map: MapImage;
  grid: GridSpec;
  fog: Record<string, FogRegion>;
  mode: FogCanvasMode;
  onAdd: (region: FogAdd) => void;
  onRemove: (regionId: string) => void;
  /** A message for the GM, such as the corner limit. */
  onNotice: (text: string) => void;
  busy: boolean;
  /** Draw fog the way players see it, with no outlines. */
  playerView?: boolean;
}) {
  const [corners, setCorners] = useState<Point[]>([]);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

  // A new tool starts clean: no half-drawn region carried over.
  useEffect(() => {
    setCorners([]);
    setAnchor(null);
    setHover(null);
  }, [mode]);

  const onMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  const closePolygon = () => {
    if (corners.length >= 3) onAdd({ shape: "polygon", points: corners });
    setCorners([]);
  };

  return (
    <MapCanvas
      map={map}
      grid={grid}
      mode={mode}
      pan={mode === "pan"}
      label="Map fog. Drag a rectangle, click out a polygon, or click fog to reveal it; the wheel or a pinch zooms, and two fingers pan."
      onMove={(p) => setHover(p)}
      onCancel={() => setAnchor(null)}
      onSecondary={() => { setCorners([]); setAnchor(null); }}
      onPress={(p) => { if (mode === "rect" && !busy) setAnchor(clamp(p, map)); }}
      onRelease={(p, _event, moved, view) => {
        if (busy) return;
        if (mode === "rect") {
          const from = anchor;
          setAnchor(null);
          if (from && moved) onAdd({ shape: "rect", from, to: clamp(p, map) });
          return;
        }
        if (moved) return;
        if (mode === "reveal") {
          const region = fogRegionAt(fog, p);
          if (region) onRemove(region.id);
          return;
        }
        if (mode !== "polygon" || !onMap(p)) return;
        const first = corners[0];
        if (first && corners.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) <= CLOSE_PX * view.px) {
          closePolygon();
          return;
        }
        if (corners.length >= MAX_FOG_POINTS) {
          onNotice(`A fog region holds at most ${MAX_FOG_POINTS} corners. Close this one, then start another.`);
          return;
        }
        setCorners([...corners, p]);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && corners.length >= 3) {
          closePolygon();
          e.preventDefault();
          e.stopPropagation();
        } else if ((e.key === "Enter" || e.key === "Escape") && (corners.length > 0 || anchor)) {
          // Escape drops a half-drawn region; with none, it is left to close the editor.
          setCorners([]);
          setAnchor(null);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {(view) => {
        const px = view.px;
        const revealing = mode === "reveal" && hover ? fogRegionAt(fog, hover) : null;
        const draft = anchor && hover ? clamp(hover, map) : null;
        return (
          <>
            {Object.values(fog).map((region) => (
              <polygon
                key={region.id}
                points={region.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={playerView ? PLAYER_FOG : "#0b0d12"}
                fillOpacity={playerView ? 1 : 0.62}
                stroke={revealing?.id === region.id ? "#e74c3c" : playerView ? "none" : "#9aa4b2"}
                strokeWidth={(revealing?.id === region.id ? 3 : 1.5) * px}
                strokeDasharray={`${6 * px} ${4 * px}`}
              />
            ))}
            {anchor && draft && (
              <rect
                x={Math.min(anchor.x, draft.x)} y={Math.min(anchor.y, draft.y)}
                width={Math.abs(draft.x - anchor.x)} height={Math.abs(draft.y - anchor.y)}
                fill="#ffd166" fillOpacity={0.18} stroke="#ffd166" strokeWidth={2 * px} strokeDasharray={`${8 * px} ${5 * px}`}
              />
            )}
            {mode === "polygon" && corners.length > 0 && (
              <g>
                <polyline
                  points={[...corners, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="#ffd166" fillOpacity={0.12} stroke="#ffd166" strokeWidth={2.5 * px} strokeDasharray={`${8 * px} ${5 * px}`}
                />
                {corners.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={(i === 0 && corners.length >= 3 ? 6 : 4) * px} fill={i === 0 ? "#fff" : "#ffd166"} stroke="#111" strokeWidth={1.5 * px} />
                ))}
              </g>
            )}
          </>
        );
      }}
    </MapCanvas>
  );
}
