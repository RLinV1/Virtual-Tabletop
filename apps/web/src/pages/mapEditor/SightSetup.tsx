import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Eye, EyeSlash, Infinity as InfinityIcon, Plus, Ruler, Trash, X } from "@phosphor-icons/react";
import { blocksMovement, EMPTY_STATS, filterStateForViewer, snapTokenCenter, viewerSight, type Participant, type Point, type RoomState, type Token, type Wall } from "@vtt/shared";
import type { EditorConnection } from "../../net/roomConnection";
import { makeSightMaskCanvas, sightColor } from "../../board/sightMask";
import { rangeFill } from "../../ui/rangeFill";
import { HudLayout } from "./HudLayout";

const MAX_SQUARES = 60;
/** The editor-only viewer that owns the test tokens: never a room participant, never sent anywhere. */
const TEST_ID = "sight-test-token";
const TEST_VIEWER: Participant = { id: TEST_ID, role: "player", displayName: "Test tokens" };

interface TestToken { id: string; name: string; position: Point }

const isPortal = (w: Wall) => w.portal !== undefined || w.uvttPortal !== undefined;
const isOpen = (w: Wall) => !blocksMovement(w);
/** The wall with its door or window opened, or closed if it was open. */
const flipped = (w: Wall): Wall =>
  w.portal ? { ...w, portal: { ...w.portal, state: isOpen(w) ? "closed" : "open" } } : { ...w, uvttPortal: { ...w.uvttPortal, closed: isOpen(w) } };

/**
 * The map editor's Sight step (map-editor-sight-step): line of sight on or off and the sight range
 * for the whole room, previewed with test tokens the GM adds, removes and drags. The room's own
 * tokens are not shown. Settings go to the editor draft and reach the room only with Save changes;
 * test tokens never leave the editor.
 */
export function SightSetup({ connection, state }: { connection: EditorConnection; state: RoomState }) {
  const { map, grid } = state.scene;
  const [message, setMessage] = useState<string | null>(null);
  // Snapped to a square like a token dropped on the board, and kept on the map.
  const place = (p: Point): Point => {
    if (!map) return p;
    const inside = (q: Point): Point => ({ x: Math.min(map.width, Math.max(0, q.x)), y: Math.min(map.height, Math.max(0, q.y)) });
    const s = snapTokenCenter(inside(p), 1, grid);
    // A snap past the edge steps back one square.
    return { x: s.x > map.width ? s.x - grid.cellSize : s.x < 0 ? s.x + grid.cellSize : s.x, y: s.y > map.height ? s.y - grid.cellSize : s.y < 0 ? s.y + grid.cellSize : s.y };
  };
  const centre = (offset = 0): Point =>
    map ? place({ x: map.width / 2 + offset * grid.cellSize, y: map.height / 2 }) : { x: 0, y: 0 };
  const [tokens, setTokens] = useState<TestToken[]>([]);
  const nextNumber = useRef(1);
  // The step opens asking for a first token; Add token asks again. The next click on the map places it.
  const [placing, setPlacing] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  // A drag only moves the marker; sight updates on drop, like a drag on the board.
  const [drag, setDrag] = useState<{ id: string; at: Point } | null>(null);
  // Where on the token it was grabbed, so it moves with the pointer instead of jumping its centre to it.
  const grab = useRef<Point>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  // Doors and windows opened or closed for the preview only: the room's walls don't change.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const walls = useMemo(
    () => Object.fromEntries(Object.values(state.walls).map((w) => [w.id, toggled.has(w.id) ? flipped(w) : w])),
    [state.walls, toggled],
  );
  const toggle = (id: string) => setToggled((now) => {
    const next = new Set(now);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const range = state.scene.sightRange ?? null;
  const enabled = state.scene.lineOfSight === true;

  // The room with only the test tokens, as a player owning them would receive it. Line of sight is
  // forced on so the range can be tuned before it is turned on. With one selected, only it is owned.
  const preview = useMemo(() => {
    if (!map || tokens.length === 0) return null;
    const { sightRange: _drop, ...rest } = state.scene;
    const scene = { ...rest, lineOfSight: true, ...(range !== null && { sightRange: range }) };
    const asToken = (t: TestToken): Token => ({
      id: t.id, name: t.name, position: t.position, size: 1, rotation: 0, color: "#c2410c", imageUrl: null,
      ownerIds: selected === null || selected === t.id ? [TEST_ID] : [], hidden: false, stats: EMPTY_STATS, conditions: [],
    });
    const seen = { ...state, scene, walls, tokens: Object.fromEntries(tokens.map((t) => [t.id, asToken(t)])) };
    return { polygons: viewerSight(seen, TEST_VIEWER), visible: new Set(Object.keys(filterStateForViewer(seen, TEST_VIEWER).tokens)) };
  }, [map, tokens, selected, state, walls, range]);
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
  const setRange = (next: number) => void send({ type: "scene.setSightRange", range: Math.min(grid.unitsPerCell * 1000, Math.max(grid.unitsPerCell, next)) });

  const clamp = (p: Point): Point => ({ x: Math.min(map.width, Math.max(0, p.x)), y: Math.min(map.height, Math.max(0, p.y)) });
  const moveTo = (id: string, position: Point) => setTokens((now) => now.map((t) => (t.id === id ? { ...t, position } : t)));
  const add = (at?: Point) => {
    const n = nextNumber.current++;
    setTokens((now) => [...now, { id: `test-${n}`, name: `Token ${n}`, position: at ? place(at) : centre(now.length) }]);
    setPlacing(false);
  };
  const remove = (id: string) => {
    setTokens((now) => now.filter((t) => t.id !== id));
    if (selected === id) setSelected(null);
  };
  // Pointer position in map pixels.
  const toMap = (e: PointerEvent<SVGElement>): Point | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const dragTo = (e: PointerEvent<SVGSVGElement>) => {
    const p = drag && toMap(e);
    if (p) setDrag({ id: drag.id, at: clamp({ x: p.x + grab.current.x, y: p.y + grab.current.y }) });
  };
  // Alt drops it where it is, as on the board.
  const drop = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    moveTo(drag.id, e.altKey ? drag.at : place(drag.at));
    setDrag(null);
  };
  const onTokenKey = (t: TestToken) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(selected === t.id ? null : t.id);
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step) return;
    e.preventDefault();
    moveTo(t.id, place({ x: t.position.x + step[0]! * grid.cellSize, y: t.position.y + step[1]! * grid.cellSize }));
  };

  const radius = grid.cellSize / 2 - 4;
  const chosen = tokens.find((t) => t.id === selected) ?? null;
  const others = tokens.length - 1;
  const seenCount = chosen ? tokens.filter((t) => t.id !== chosen.id && preview?.visible.has(t.id)).length : 0;

  return (
    <HudLayout className="map-editor-split map-editor-sight-split">
      <aside className="map-editor-panel sight-token-panel" aria-label="Test tokens">
        <h3 className="map-editor-heading">Test tokens</h3>
        <p className="muted small-print">Drag them on the map to check what they see. They snap to the grid; hold Alt to place one freely. Only you see them, and they aren't saved.</p>
        {tokens.length === 0 ? (
          <p className="muted small-print">Place a token on the map to preview sight.</p>
        ) : (
          <ul className="sight-token-list">
            {tokens.map((t) => (
              <li key={t.id}>
                <button type="button" className="tool-button sight-token-pick" aria-pressed={selected === t.id} onClick={() => setSelected(selected === t.id ? null : t.id)}>
                  <span className="sight-token-swatch" aria-hidden="true" />
                  <span>{t.name}</span>
                </button>
                <button type="button" className="tool-button icon-button" aria-label={`Remove ${t.name}`} onClick={() => remove(t.id)}>
                  <Trash size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="secondary" aria-pressed={placing} onClick={() => setPlacing(!placing)}>
          <Plus size={16} aria-hidden="true" /> {placing ? "Cancel" : "Add token"}
        </button>
        {Object.values(state.walls).some(isPortal) && (
          <p className="muted small-print">Click a door or window on the map to open or close it here. Windows never block sight. The room's doors don't change.</p>
        )}
      </aside>
      <div className="sight-preview-stage">
        <svg
          ref={svgRef}
          className={`map-editor-sight-preview${drag ? " is-dragging" : ""}${placing ? " is-placing" : ""}`}
          viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid meet"
          aria-label={placing ? "Sight preview. Click to place a test token, or press Enter to place it in the middle." : "Sight preview"}
          tabIndex={placing ? 0 : undefined}
          onKeyDown={(e) => { if (placing && e.target === e.currentTarget && e.key === "Enter") { e.preventDefault(); add(); } }}
          onPointerDown={(e) => {
            if ((e.target as Element).closest(".sight-test-token, .sight-portal")) return;
            const p = placing && e.button === 0 && toMap(e);
            if (p) add(p);
            else setSelected(null);
          }}
          onPointerMove={dragTo}
          onPointerUp={drop}
          onPointerCancel={() => setDrag(null)}
        >
          <image href={map.url} width={map.width} height={map.height} />
          {mask && <image href={mask} width={map.width} height={map.height} opacity={0.78} />}
          {Object.values(walls).filter((w) => !isPortal(w)).map((w) => (
            <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="sight-preview-wall" strokeWidth={Math.max(2, grid.cellSize / 20)} />
          ))}
          {Object.values(walls).filter(isPortal).map((w) => {
            const kind = w.portal?.kind === "window" ? "Window" : "Door";
            const open = isOpen(w);
            const status = open ? "open" : w.portal?.state === "locked" ? "locked" : "closed";
            return (
              <g
                key={w.id} className={`sight-portal${open ? " is-open" : ""}`} tabIndex={0} role="button" aria-pressed={open}
                aria-label={`${kind}, ${status}. Press to ${open ? "close" : "open"} it in this preview.`}
                onClick={() => toggle(w.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(w.id); } }}
              >
                {/* A wide invisible line so a thin door is easy to click. */}
                <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="sight-portal-hit" strokeWidth={Math.max(16, grid.cellSize / 3)} />
                <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} className="sight-preview-portal" strokeWidth={Math.max(3, grid.cellSize / 12)} />
              </g>
            );
          })}
          {tokens.map((t) => {
            const at = drag?.id === t.id ? drag.at : t.position;
            const unseen = chosen !== null && t.id !== chosen.id && !preview?.visible.has(t.id);
            return (
              <g
                key={t.id}
                className={`sight-test-token${unseen ? " is-unseen" : ""}`}
                tabIndex={0} role="button" aria-pressed={selected === t.id}
                aria-label={`${t.name}. Drag it, or use the arrow keys to move it one square. Press Enter to show only its sight.`}
                onKeyDown={onTokenKey(t)}
                onPointerDown={(e) => {
                  const p = e.button === 0 && toMap(e);
                  if (!p) return;
                  // Capture on the SVG so the drag follows the pointer off the token and off the map.
                  svgRef.current?.setPointerCapture(e.pointerId);
                  grab.current = { x: t.position.x - p.x, y: t.position.y - p.y };
                  setSelected(t.id);
                  setDrag({ id: t.id, at: t.position });
                }}
              >
                <circle cx={at.x} cy={at.y} r={radius} strokeWidth={Math.max(2, grid.cellSize / 16)} />
                <text x={at.x} y={at.y} className="sight-test-token-label" fontSize={radius} dominantBaseline="central" textAnchor="middle">
                  {t.name.replace("Token ", "")}
                </text>
              </g>
            );
          })}
        </svg>
        {placing && (
          <div className="sight-place-prompt" role="status">
            <span>{tokens.length === 0 ? "Click the map to place a test token." : "Click the map to place another token."}</span>
          </div>
        )}
        {chosen && (
          <div className="sight-popup" role="status">
            <span>
              {others === 0
                ? `${chosen.name} has no other tokens to see. Add one to test.`
                : `${chosen.name} sees ${seenCount} of ${others} other ${others === 1 ? "token" : "tokens"}.`}
            </span>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setSelected(null)}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
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
        {message && <p className="error" role="alert">{message}</p>}
      </aside>
    </HudLayout>
  );
}
