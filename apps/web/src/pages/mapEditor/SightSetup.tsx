import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Eye, EyeSlash, Infinity as InfinityIcon, Ruler } from "@phosphor-icons/react";
import { EMPTY_STATS, filterStateForViewer, viewerSight, type Participant, type Point, type RoomState, type Token } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { makeSightMaskCanvas, sightColor } from "../../board/sightMask";
import { rangeFill } from "../../ui/rangeFill";
import { HudLayout } from "./HudLayout";

const MAX_SQUARES = 60;
/** The editor-only test viewer: never a room participant, never sent anywhere. */
const TEST_ID = "sight-test-token";
const TEST_VIEWER: Participant = { id: TEST_ID, role: "player", displayName: "Test token" };

/**
 * The map editor's Sight step (map-editor-sight-step): line of sight on or off and the sight range
 * for the whole room, with a preview of what a chosen player would see. Changes go to the editor
 * draft and reach the room only with Save changes.
 */
export function SightSetup({ connection, state }: { connection: EditorConnection; state: RoomState }) {
  const { map, grid } = state.scene;
  const players = Object.values(state.participants).filter((p) => p.role === "player" && !p.left && !p.revoked);
  const [viewerId, setViewerId] = useState(TEST_ID);
  const [message, setMessage] = useState<string | null>(null);
  const viewer = viewerId === TEST_ID ? TEST_VIEWER : (players.find((p) => p.id === viewerId) ?? TEST_VIEWER);
  const testing = viewer === TEST_VIEWER;
  // The test token's drop point drives the preview; `dragAt` only moves the marker, like a drag on the board.
  const [testAt, setTestAt] = useState<Point | null>(null);
  const [dragAt, setDragAt] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const range = state.scene.sightRange ?? null;
  const enabled = state.scene.lineOfSight === true;
  const testPos = useMemo(() => testAt ?? (map ? { x: map.width / 2, y: map.height / 2 } : { x: 0, y: 0 }), [testAt, map]);
  // The room as the chosen viewer would receive it, with line of sight forced on so the range can be tuned first.
  const preview = useMemo(() => {
    if (!map) return null;
    const { sightRange: _drop, ...rest } = state.scene;
    const scene = { ...rest, lineOfSight: true, ...(range !== null && { sightRange: range }) };
    const test: Token = {
      id: TEST_ID, name: "Test token", position: testPos, size: 1, rotation: 0, color: "#c2410c", imageUrl: null,
      ownerIds: [TEST_ID], hidden: false, stats: EMPTY_STATS, conditions: [],
    };
    const seen = testing ? { ...state, scene, tokens: { ...state.tokens, [TEST_ID]: test } } : { ...state, scene };
    const tokens = Object.values(filterStateForViewer(seen, viewer).tokens).filter((t) => t.id !== TEST_ID);
    return { polygons: viewerSight(seen, viewer), tokens };
  }, [map, viewer, testing, state, range, testPos]);
  const polygons = preview?.polygons ?? null;

  // The mask as an image the preview SVG can scale with the map (letterboxed like the other steps).
  const mask = useMemo(() => {
    if (!map || !polygons) return null;
    return makeSightMaskCanvas(polygons, map.width, map.height, grid.cellSize, sightColor(null)).canvas.toDataURL();
  }, [polygons, map, grid.cellSize]);

  if (!map) return <p className="map-editor-empty">Apply a map before setting up sight.</p>;

  const send = async (command: { type: "scene.setLineOfSight"; enabled: boolean } | { type: "scene.setSightRange"; range: number | null }) => {
    const result = await connection.command(command);
    setMessage(result.ok ? null : result.message);
  };
  const unit = grid.unitLabel;
  const squares = Math.max(1, Math.round((range ?? grid.unitsPerCell * MAX_SQUARES) / grid.unitsPerCell));
  // A longer range typed as an exact distance stretches the slider, so dragging it never cuts the range short.
  const maxSquares = Math.max(MAX_SQUARES, squares);

  const total = Object.values(state.tokens).filter((t) => !t.hidden).length;
  const setRange = (next: number) => void send({ type: "scene.setSightRange", range: Math.min(grid.unitsPerCell * 1000, Math.max(grid.unitsPerCell, next)) });

  // Pointer position in map pixels, clamped to the map.
  const toMap = (e: PointerEvent<SVGSVGElement>): Point | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.min(map.width, Math.max(0, p.x)), y: Math.min(map.height, Math.max(0, p.y)) };
  };
  const dragTo = (e: PointerEvent<SVGSVGElement>) => { if (dragAt) setDragAt(toMap(e) ?? dragAt); };
  const drop = () => { if (dragAt) { setTestAt(dragAt); setDragAt(null); } };
  const nudge = (e: KeyboardEvent<SVGGElement>) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    const x = Math.min(map.width, Math.max(0, testPos.x + step[0]! * grid.cellSize));
    const y = Math.min(map.height, Math.max(0, testPos.y + step[1]! * grid.cellSize));
    setTestAt({ x, y });
  };
  const marker = dragAt ?? testPos;
  const radius = grid.cellSize / 2 - 4;

  return (
    <HudLayout className="map-editor-split">
      <svg
        ref={svgRef}
        className={`map-editor-sight-preview${testing ? " is-testing" : ""}${dragAt ? " is-dragging" : ""}`}
        viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid meet"
        aria-label={`What ${viewer.displayName} would see`}
        onPointerDown={(e) => {
          if (!testing || e.button !== 0) return;
          const p = toMap(e);
          if (!p) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragAt(p);
        }}
        onPointerMove={dragTo}
        onPointerUp={drop}
        onPointerCancel={() => setDragAt(null)}
      >
        <image href={map.url} width={map.width} height={map.height} />
        {mask && <image href={mask} width={map.width} height={map.height} opacity={0.78} />}
        {Object.values(state.walls).map((w) => (
          <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className={w.portal ? "sight-preview-portal" : "sight-preview-wall"} strokeWidth={Math.max(2, grid.cellSize / 20)} />
        ))}
        {preview?.tokens.map((t) => (
          <circle key={t.id} cx={t.position.x} cy={t.position.y} r={(t.size * grid.cellSize) / 2 - 4} fill={t.color} className="sight-preview-token" strokeWidth={Math.max(2, grid.cellSize / 20)} />
        ))}
        {testing && (
          <g
            className="sight-test-token" tabIndex={0} role="button" onKeyDown={nudge}
            aria-label="Test token. Drag it on the map, or use the arrow keys to move it one square."
          >
            <circle cx={marker.x} cy={marker.y} r={radius} strokeWidth={Math.max(2, grid.cellSize / 16)} />
            <circle cx={marker.x} cy={marker.y} r={radius * 0.28} className="sight-test-token-dot" />
          </g>
        )}
      </svg>
      <aside className="map-editor-hud" aria-label="Sight settings">
        <section className="stack">
          <h3 className="map-editor-heading">Line of sight</h3>
          <button
            type="button"
            className="tool-button map-editor-mode"
            aria-pressed={enabled}
            onClick={() => void send({ type: "scene.setLineOfSight", enabled: !enabled })}
          >
            {enabled ? <Eye size={18} aria-hidden="true" /> : <EyeSlash size={18} aria-hidden="true" />}
            <span>{enabled ? "Line of sight on" : "Line of sight off"}</span>
          </button>
          <p className="muted small-print">Players see only what their own tokens can see. Walls, closed doors and fog block it.</p>
        </section>
        <section className="stack">
          <h3 className="map-editor-heading">Range</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label="Sight range">
            <button type="button" role="radio" aria-checked={range === null} className="tool-button map-editor-mode"
              onClick={() => { if (range !== null) void send({ type: "scene.setSightRange", range: null }); }}>
              <InfinityIcon size={18} aria-hidden="true" />
              <span>Unlimited</span>
            </button>
            <button type="button" role="radio" aria-checked={range !== null} className="tool-button map-editor-mode"
              onClick={() => { if (range === null) setRange(12 * grid.unitsPerCell); }}>
              <Ruler size={18} aria-hidden="true" />
              <span>Limited</span>
            </button>
          </div>
          {range === null ? (
            <p className="muted small-print">Sight runs to the nearest wall or the map edge.</p>
          ) : (
            <>
              <label className="stack">
                <span className="small-print">Distance: {range} {unit} ({squares} {squares === 1 ? "square" : "squares"})</span>
                <input
                  type="range" className="range range-filled" aria-label="Sight range in squares" min={1} max={maxSquares} step={1}
                  value={squares} style={rangeFill(squares, 1, maxSquares)}
                  onChange={(e) => setRange(e.target.valueAsNumber * grid.unitsPerCell)}
                />
              </label>
              <label className="sight-range-exact">
                <span className="small-print">Exact distance</span>
                <span className="sight-range-input">
                  <input
                    type="number" inputMode="numeric" aria-label={`Sight range in ${unit}`}
                    min={grid.unitsPerCell} max={grid.unitsPerCell * 1000} step={grid.unitsPerCell} value={range}
                    onChange={(e) => { const n = e.target.valueAsNumber; if (n > 0) setRange(n); }}
                  />
                  <span className="muted">{unit}</span>
                </span>
              </label>
            </>
          )}
        </section>
        <section className="stack">
          <h3 className="map-editor-heading">Preview</h3>
          <label className="stack">
            <span className="small-print">Preview as</span>
            <select value={viewer.id} onChange={(e) => setViewerId(e.target.value)}>
              <option value={TEST_ID}>Test token</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </label>
          {testing && <p className="muted small-print">Drag the test token on the map. Its sight updates when you drop it, like a token on the board. Only you see it.</p>}
          <p className="map-editor-count">{viewer.displayName} sees {preview?.tokens.length ?? 0} of {total} {total === 1 ? "token" : "tokens"}.</p>
        </section>
        {message && <p className="error" role="alert">{message}</p>}
      </aside>
    </HudLayout>
  );
}
