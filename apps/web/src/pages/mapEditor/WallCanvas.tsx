import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { GridSpec, MapImage, Point, Wall } from "@vtt/shared";
import { wallAt, wallPoint, type WallMode } from "../../board/tools";

/** A drawn wall's end joins an existing wall end this close, in screen pixels (wall-editing D2). */
const JOIN_PX = 12;
/** Erase picks the wall within this many screen pixels of the click. */
const PICK_PX = 10;
/** A press that moves further than this is a pan, not a click. */
const CLICK_SLOP_PX = 4;
const MAX_ZOOM = 12;

export type CanvasMode = WallMode | "pan";

interface Camera {
  /** Map point at the centre of the view. */
  cx: number;
  cy: number;
  /** Multiple of the fit-to-view scale. */
  zoom: number;
}

/**
 * The map editor's wall canvas (map-editor D3): the map with its walls in SVG, in board
 * coordinates (invariant 8). Draw chains walls, Erase removes the wall under the pointer, and
 * Detect like this sends the clicked point. The wheel zooms; Pan mode, the middle button or
 * Space-drag pans.
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ cx: map.width / 2, cy: map.height / 2, zoom: 1 });
  const [chain, setChain] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [free, setFree] = useState(false);
  const [space, setSpace] = useState(false);
  const press = useRef<{ x: number; y: number; camera: Camera; pan: boolean; moved: boolean } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setView({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // A new mode starts clean: no half-drawn wall carried into Erase.
  useEffect(() => {
    setChain(null);
    setHover(null);
  }, [mode]);

  const fit = view.width > 0 && view.height > 0 ? Math.min(view.width / map.width, view.height / map.height) : 1;
  /** Screen pixels per map pixel. */
  const scale = fit * camera.zoom;
  const viewBox = useMemo(() => {
    const w = view.width / scale || map.width;
    const h = view.height / scale || map.height;
    return { x: camera.cx - w / 2, y: camera.cy - h / 2, w, h };
  }, [view, scale, camera, map]);

  const toMap = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: viewBox.x + (clientX - rect.left) / scale, y: viewBox.y + (clientY - rect.top) / scale };
  };
  const onMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  const snap = (p: Point, alt: boolean) => wallPoint(p, walls, grid, JOIN_PX / scale, alt);
  const erasing = mode === "erase" && hover ? wallAt(walls, hover, PICK_PX / scale) : null;

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const at = toMap(e.clientX, e.clientY);
    const zoom = Math.min(MAX_ZOOM, Math.max(1, camera.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const ratio = camera.zoom / zoom;
    // Keep the map point under the pointer where it is.
    setCamera({ zoom, cx: at.x - (at.x - camera.cx) * ratio, cy: at.y - (at.y - camera.cy) * ratio });
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    svgRef.current?.focus();
    if (e.button === 2) {
      setChain(null);
      return;
    }
    const pan = mode === "pan" || e.button === 1 || space;
    press.current = { x: e.clientX, y: e.clientY, camera, pan, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    setFree(e.altKey);
    const p = toMap(e.clientX, e.clientY);
    setHover(mode === "draw" ? snap(p, e.altKey) : p);
    const start = press.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > CLICK_SLOP_PX) start.moved = true;
    if (start.pan && start.moved) setCamera({ ...start.camera, cx: start.camera.cx - dx / scale, cy: start.camera.cy - dy / scale });
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const start = press.current;
    press.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!start || start.pan || start.moved || busy) return;
    const p = toMap(e.clientX, e.clientY);
    if (mode === "sample") {
      if (onMap(p)) onSample(p);
      return;
    }
    if (mode === "erase") {
      const wall = wallAt(walls, p, PICK_PX / scale);
      if (wall) onRemove(wall.id);
      return;
    }
    if (mode !== "draw" || !onMap(p)) return;
    const point = snap(p, e.altKey);
    // Each segment is its own command, so each undoes on its own (wall-editing D2).
    if (chain && (chain.x !== point.x || chain.y !== point.y)) onAdd(chain, point);
    setChain(point);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === " ") {
      setSpace(true);
      e.preventDefault();
    }
    // Enter or Escape ends a chain; with no chain, Escape is left to close the editor.
    if ((e.key === "Enter" || e.key === "Escape") && chain) {
      setChain(null);
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const px = 1 / scale;
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (grid.cellSize * scale < 6) return lines;
    for (let x = grid.offsetX % grid.cellSize; x <= map.width; x += grid.cellSize) lines.push({ x1: x, y1: 0, x2: x, y2: map.height });
    for (let y = grid.offsetY % grid.cellSize; y <= map.height; y += grid.cellSize) lines.push({ x1: 0, y1: y, x2: map.width, y2: y });
    return lines;
  }, [grid, map, scale]);

  return (
    <div className="wall-canvas">
      <svg
        ref={svgRef}
        className={`wall-canvas-svg mode-${space ? "pan" : mode}`}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        tabIndex={0}
        role="application"
        aria-label="Map walls. Draw, erase or detect walls with the pointer; the wheel zooms."
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { if (e.key === " ") setSpace(false); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <image href={map.url} x={0} y={0} width={map.width} height={map.height} preserveAspectRatio="none" />
        <g stroke="#ffffff" strokeOpacity={0.18} strokeWidth={px}>
          {gridLines.map((l, i) => <line key={i} {...l} />)}
        </g>
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
      </svg>
      <div className="wall-canvas-zoom" role="group" aria-label="Zoom">
        <button type="button" className="secondary small" onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, c.zoom * 1.5) }))}>+</button>
        <button type="button" className="secondary small" onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(1, c.zoom / 1.5) }))}>−</button>
        <button type="button" className="secondary small" onClick={() => setCamera({ cx: map.width / 2, cy: map.height / 2, zoom: 1 })}>Fit</button>
      </div>
    </div>
  );
}
