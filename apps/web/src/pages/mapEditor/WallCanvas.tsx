import { useEffect, useState } from "react";
import type { GridSpec, MapImage, Point, Wall } from "@vtt/shared";
import { wallAt, wallPoint, type WallMode } from "../../board/tools";
import { MapCanvas } from "./MapCanvas";

/** A drawn wall's end joins an existing wall end this close, in screen pixels (wall-editing D2). */
const JOIN_PX = 12;
/** Erase picks the wall within this many screen pixels of the click. */
const PICK_PX = 10;

export type CanvasMode = WallMode | "pan";

/**
 * The Walls step's canvas (map-editor D3): the map with its walls in board coordinates
 * (invariant 8). Draw chains walls, Erase removes the wall under the pointer, and Detect like
 * this sends the clicked point.
 */
export function WallCanvas({ map, grid, walls, mode, onAdd, onRemove, onSample, busy }: {
  map: MapImage;
  grid: GridSpec;
  walls: Record<string, Wall>;
  mode: CanvasMode;
  onAdd: (a: Point, b: Point) => void;
  onRemove: (wallId: string) => void;
  onSample: (at: Point) => void;
  busy: boolean;
}) {
  const [chain, setChain] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [free, setFree] = useState(false);

  // A new mode starts clean: no half-drawn wall carried into Erase.
  useEffect(() => {
    setChain(null);
    setHover(null);
  }, [mode]);

  const onMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  const snap = (p: Point, alt: boolean, px: number) => wallPoint(p, walls, grid, JOIN_PX * px, alt);

  return (
    <MapCanvas
      map={map}
      grid={grid}
      mode={mode}
      pan={mode === "pan"}
      label="Map walls. Draw, erase or detect walls with the pointer; the wheel or a pinch zooms, and two fingers pan."
      onMove={(p, e, view) => {
        setFree(e.altKey);
        setHover(p && (mode === "draw" ? snap(p, e.altKey, view.px) : p));
      }}
      onSecondary={() => setChain(null)}
      onRelease={(p, e, moved, view) => {
        if (moved || busy) return;
        if (mode === "sample") {
          if (onMap(p)) onSample(p);
          return;
        }
        if (mode === "erase") {
          const wall = wallAt(walls, p, PICK_PX * view.px);
          if (wall) onRemove(wall.id);
          return;
        }
        if (mode !== "draw" || !onMap(p)) return;
        const point = snap(p, e.altKey, view.px);
        // Each segment is its own command, so each undoes on its own (wall-editing D2).
        if (chain && (chain.x !== point.x || chain.y !== point.y)) onAdd(chain, point);
        setChain(point);
      }}
      onKeyDown={(e) => {
        // Enter or Escape ends a chain; with no chain, Escape is left to close the editor.
        if ((e.key === "Enter" || e.key === "Escape") && chain) {
          setChain(null);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {(view) => {
        const px = view.px;
        const erasing = mode === "erase" && hover ? wallAt(walls, hover, PICK_PX * px) : null;
        return (
          <>
            <g strokeLinecap="round">
              {Object.values(walls).map((w) => (
                <g key={w.id}>
                  <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#111" strokeOpacity={0.8} strokeWidth={7 * px} />
                  <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={erasing?.id === w.id ? "#e74c3c" : "#ff6b2c"} strokeWidth={(erasing?.id === w.id ? 6 : 3.5) * px} />
                </g>
              ))}
            </g>
            {mode === "draw" && chain && (
              <g>
                <line x1={chain.x} y1={chain.y} x2={(hover ?? chain).x} y2={(hover ?? chain).y} stroke="#ffd166" strokeWidth={3 * px} strokeDasharray={`${8 * px} ${5 * px}`} />
                <circle cx={chain.x} cy={chain.y} r={5 * px} fill="#fff" stroke="#111" strokeWidth={2 * px} />
              </g>
            )}
            {mode === "draw" && hover && <circle cx={hover.x} cy={hover.y} r={4 * px} fill={free ? "#ffd166" : "#ff6b2c"} stroke="#111" strokeWidth={1.5 * px} />}
            {mode === "sample" && hover && onMap(hover) && (
              <circle cx={hover.x} cy={hover.y} r={Math.max(6 * px, grid.cellSize * 0.15)} fill="none" stroke="#ffd166" strokeWidth={2.5 * px} />
            )}
          </>
        );
      }}
    </MapCanvas>
  );
}
