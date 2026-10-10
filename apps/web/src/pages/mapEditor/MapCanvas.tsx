import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import type { GridSpec, MapImage, Point } from "@vtt/shared";

/** A press that moves further than this is a drag, not a click. */
const CLICK_SLOP_PX = 4;
const MAX_ZOOM = 12;

interface Camera {
  /** Map point at the centre of the view. */
  cx: number;
  cy: number;
  /** Multiple of the fit-to-view scale. */
  zoom: number;
}

/** What a layer needs to draw in map coordinates at a steady size on screen. */
export interface CanvasView {
  /** Screen pixels per map pixel. */
  scale: number;
  /** One screen pixel in map pixels: multiply by a size in screen pixels. */
  px: number;
}

/**
 * The map editor's SVG map canvas (map-editor D3): the map and its grid in board coordinates
 * (invariant 8) with a viewBox camera. The wheel zooms around the pointer; Pan mode, the middle
 * button or Space-drag pans. Every pointer callback gets a map point, never a screen point. Steps
 * draw their own layers as `children` and choose what a click or drag does.
 */
export function MapCanvas({
  map, grid, mode, pan, label, onMove, onPress, onRelease, onSecondary, onKeyDown, children,
}: {
  map: MapImage;
  grid: GridSpec;
  /** Names the cursor (`mode-<mode>`). Space held shows `pan`. */
  mode: string;
  /** The step's Pan tool is chosen: every drag moves the view. */
  pan: boolean;
  label: string;
  /** The pointer moved over the map, or left it (null). */
  onMove?: (at: Point | null, event: PointerEvent<SVGSVGElement>, view: CanvasView) => void;
  /** A primary press that is not a pan. */
  onPress?: (at: Point, event: PointerEvent<SVGSVGElement>, view: CanvasView) => void;
  /** The matching release; `moved` when the pointer travelled past a click's slop. */
  onRelease?: (at: Point, event: PointerEvent<SVGSVGElement>, moved: boolean, view: CanvasView) => void;
  /** A right-button press. */
  onSecondary?: () => void;
  onKeyDown?: (event: KeyboardEvent<SVGSVGElement>) => void;
  children: (view: CanvasView) => ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ cx: map.width / 2, cy: map.height / 2, zoom: 1 });
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

  const fit = view.width > 0 && view.height > 0 ? Math.min(view.width / map.width, view.height / map.height) : 1;
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
      onSecondary?.();
      return;
    }
    const panning = pan || e.button === 1 || space;
    press.current = { x: e.clientX, y: e.clientY, camera, pan: panning, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
    if (!panning) onPress?.(toMap(e.clientX, e.clientY), e, { scale, px: 1 / scale });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    onMove?.(toMap(e.clientX, e.clientY), e, { scale, px: 1 / scale });
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
    if (!start || start.pan) return;
    onRelease?.(toMap(e.clientX, e.clientY), e, start.moved, { scale, px: 1 / scale });
  };

  const handleKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === " ") {
      setSpace(true);
      e.preventDefault();
    }
    onKeyDown?.(e);
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
        aria-label={label}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={(e) => onMove?.(null, e, { scale, px: 1 / scale })}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => { if (e.key === " ") setSpace(false); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <image href={map.url} x={0} y={0} width={map.width} height={map.height} preserveAspectRatio="none" />
        <g stroke="#ffffff" strokeOpacity={0.18} strokeWidth={px}>
          {gridLines.map((l, i) => <line key={i} {...l} />)}
        </g>
        {children({ scale, px })}
      </svg>
      <div className="wall-canvas-zoom" role="group" aria-label="Zoom">
        <button type="button" className="secondary small" onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(MAX_ZOOM, c.zoom * 1.5) }))}>+</button>
        <button type="button" className="secondary small" onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(1, c.zoom / 1.5) }))}>−</button>
        <button type="button" className="secondary small" onClick={() => setCamera({ cx: map.width / 2, cy: map.height / 2, zoom: 1 })}>Fit</button>
      </div>
    </div>
  );
}
