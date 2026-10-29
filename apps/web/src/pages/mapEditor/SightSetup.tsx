import { useMemo, useState } from "react";
import { Eye, EyeSlash, Infinity as InfinityIcon, Ruler } from "@phosphor-icons/react";
import { filterStateForViewer, viewerSight, type RoomState } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { makeSightMaskCanvas, sightColor } from "../../board/sightMask";
import { rangeFill } from "../../ui/rangeFill";
import { HudLayout } from "./HudLayout";

const MAX_SQUARES = 60;

/**
 * The map editor's Sight step (map-editor-sight-step): line of sight on or off and the sight range
 * for the whole room, with a preview of what a chosen player would see. Changes go to the editor
 * draft and reach the room only with Save changes.
 */
export function SightSetup({ connection, state }: { connection: EditorConnection; state: RoomState }) {
  const { map, grid } = state.scene;
  const players = Object.values(state.participants).filter((p) => p.role === "player" && !p.left && !p.revoked);
  const [viewerId, setViewerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const viewer = players.find((p) => p.id === viewerId) ?? players[0];
  const range = state.scene.sightRange ?? null;
  const enabled = state.scene.lineOfSight === true;
  // The room as the chosen player would receive it, with line of sight forced on so the range can be tuned first.
  const preview = useMemo(() => {
    if (!map || !viewer) return null;
    const { sightRange: _drop, ...rest } = state.scene;
    const scene = { ...rest, lineOfSight: true, ...(range !== null && { sightRange: range }) };
    const seen = { ...state, scene };
    return { polygons: viewerSight(seen, viewer), tokens: Object.values(filterStateForViewer(seen, viewer).tokens) };
  }, [map, viewer, state, range]);
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
  const squares = Math.min(MAX_SQUARES, Math.max(1, Math.round((range ?? grid.unitsPerCell * MAX_SQUARES) / grid.unitsPerCell)));

  const total = Object.values(state.tokens).filter((t) => !t.hidden).length;
  const setRange = (next: number) => void send({ type: "scene.setSightRange", range: Math.min(grid.unitsPerCell * 1000, Math.max(grid.unitsPerCell, next)) });

  return (
    <HudLayout className="map-editor-split">
      <svg
        className="map-editor-sight-preview" viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid meet"
        role="img" aria-label={viewer ? `What ${viewer.displayName} would see` : "The map"}
      >
        <image href={map.url} width={map.width} height={map.height} />
        {mask && <image href={mask} width={map.width} height={map.height} opacity={0.78} />}
        {Object.values(state.walls).map((w) => (
          <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className={w.portal ? "sight-preview-portal" : "sight-preview-wall"} strokeWidth={Math.max(2, grid.cellSize / 20)} />
        ))}
        {preview?.tokens.map((t) => (
          <circle key={t.id} cx={t.position.x} cy={t.position.y} r={(t.size * grid.cellSize) / 2 - 4} fill={t.color} className="sight-preview-token" strokeWidth={Math.max(2, grid.cellSize / 20)} />
        ))}
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
                  type="range" className="range range-filled" aria-label="Sight range in squares" min={1} max={MAX_SQUARES} step={1}
                  value={squares} style={rangeFill(squares, 1, MAX_SQUARES)}
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
          {players.length === 0 ? (
            <p className="muted small-print">Invite a player to preview what they would see.</p>
          ) : (
            <>
              <label className="stack">
                <span className="small-print">Preview as</span>
                <select value={viewer?.id ?? ""} onChange={(e) => setViewerId(e.target.value)}>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </label>
              <p className="map-editor-count">{viewer?.displayName} sees {preview?.tokens.length ?? 0} of {total} {total === 1 ? "token" : "tokens"}.</p>
            </>
          )}
        </section>
        {message && <p className="error" role="alert">{message}</p>}
      </aside>
    </HudLayout>
  );
}
