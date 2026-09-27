import { CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { gridLineStyle, type GridSpec } from "@vtt/shared";
import { gridLines } from "../board/gridLines";
import { canRenderGrid, type BoardSize } from "../board/gridRenderLimit";

/** Closest zoom, in screen pixels per board pixel: enough to align a line to the pixel. */
const MAX_SCALE = 8;
const BUTTON_STEP = 1.5;

interface Camera {
  /** Board point at the centre of the view. */
  cx: number;
  cy: number;
  /** Multiple of the fit-to-map scale; 1 shows the whole map. */
  zoom: number;
}

const FIT: Camera = { cx: Number.NaN, cy: Number.NaN, zoom: 1 };

/**
 * The whole map with a grid over it, for aligning a library map's grid outside a room.
 * Zoom and pan only move the SVG viewBox, so everything is drawn in board pixels
 * (invariant 8), and lines are computed for the visible part of the map alone.
 */
export function MapGridPreview({ map, grid }: { map: BoardSize & { url: string }; grid: GridSpec }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(FIT);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const fitScale = viewport.width > 0 && viewport.height > 0
    ? Math.min(viewport.width / map.width, viewport.height / map.height)
    : 1;
  const maxZoom = Math.max(1, MAX_SCALE / fitScale);

  /** Keeps the zoom in range and the view over the map; a view wider than the map centres it. */
  const clamp = (next: Camera): Camera => {
    const zoom = Math.min(maxZoom, Math.max(1, next.zoom));
    const scale = fitScale * zoom;
    const halfW = viewport.width / scale / 2;
    const halfH = viewport.height / scale / 2;
    const axis = (c: number, half: number, size: number) =>
      half * 2 >= size || Number.isNaN(c) ? size / 2 : Math.min(size - half, Math.max(half, c));
    return { zoom, cx: axis(next.cx, halfW, map.width), cy: axis(next.cy, halfH, map.height) };
  };

  const view = clamp(camera);
  const scale = fitScale * view.zoom;
  const vw = viewport.width / scale;
  const vh = viewport.height / scale;
  const vx = view.cx - vw / 2;
  const vy = view.cy - vh / 2;

  /** Zoom by `factor`, keeping the board point under screen point (sx, sy) in place. */
  const zoomAt = (factor: number, sx = viewport.width / 2, sy = viewport.height / 2) => {
    setCamera((current) => {
      const from = clamp(current);
      const fromScale = fitScale * from.zoom;
      const px = from.cx - viewport.width / fromScale / 2 + sx / fromScale;
      const py = from.cy - viewport.height / fromScale / 2 + sy / fromScale;
      const zoom = Math.min(maxZoom, Math.max(1, from.zoom * factor));
      const toScale = fitScale * zoom;
      return clamp({ zoom, cx: px - sx / toScale + viewport.width / toScale / 2, cy: py - sy / toScale + viewport.height / toScale / 2 });
    });
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  // React's wheel listener is passive, and the page must not scroll while zooming the map.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      // Trackpad pinches arrive as ctrl+wheel with small deltas; scale both the same way.
      zoomAtRef.current(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - rect.left, e.clientY - rect.top);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    setCamera((current) => {
      const from = clamp(current);
      return clamp({ ...from, cx: from.cx - dx, cy: from.cy - dy });
    });
  };
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  const style = gridLineStyle(grid);
  const path = useMemo(() => {
    if (viewport.width === 0 || !canRenderGrid(grid.cellSize, map)) return "";
    const x0 = Math.max(0, vx);
    const y0 = Math.max(0, vy);
    const x1 = Math.min(map.width, vx + vw);
    const y1 = Math.min(map.height, vy + vh);
    const { xs, ys } = gridLines(grid, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    return xs.map((x) => `M${x} ${y0}V${y1}`).join("") + ys.map((y) => `M${x0} ${y}H${x1}`).join("");
  }, [grid, map, viewport.width, vx, vy, vw, vh]);

  const ready = viewport.width > 0 && viewport.height > 0;
  return (
    <div className="map-grid-preview">
      <svg
        ref={svgRef}
        className="map-grid-canvas"
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
        viewBox={ready ? `${vx} ${vy} ${vw} ${vh}` : `0 0 ${map.width} ${map.height}`}
        role="img"
        aria-label="Map with the grid you are editing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect x={0} y={0} width={map.width} height={map.height} fill="#2b2e35" />
        <image href={map.url} x={0} y={0} width={map.width} height={map.height} />
        {/* True line width in board pixels, but never under one screen pixel so it stays visible at fit. */}
        <path d={path} fill="none" stroke={style.color} strokeOpacity={style.opacity} strokeWidth={Math.max(style.width, 1 / scale)} />
      </svg>
      <div className="map-grid-zoom" role="group" aria-label="Zoom">
        <button type="button" className="secondary small" aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => zoomAt(1 / BUTTON_STEP)}>
          <MagnifyingGlassMinus size={16} aria-hidden="true" />
        </button>
        <span className="map-grid-zoom-level" aria-live="polite">{Math.round(scale * 100)}%</span>
        <button type="button" className="secondary small" aria-label="Zoom in" disabled={view.zoom >= maxZoom} onClick={() => zoomAt(BUTTON_STEP)}>
          <MagnifyingGlassPlus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="secondary small" aria-label="Fit map" disabled={view.zoom <= 1} onClick={() => setCamera(FIT)}>
          <CornersOut size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
