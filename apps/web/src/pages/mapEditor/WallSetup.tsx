import { useEffect, useState } from "react";
import { Door, Eraser, Eyedropper, Hand, LineSegments } from "@phosphor-icons/react";
import {
  MIN_LENGTH_MAX, SAMPLE_TOLERANCE_DEFAULT, SAMPLE_TOLERANCE_MAX, SAMPLE_TOLERANCE_MIN,
  STRICTNESS_DEFAULT, STRICTNESS_MAX, STRICTNESS_MIN,
  type CommandInput, type DetectedWall, type Point, type Portal, type PortalKind, type PortalState, type RoomState, type Wall, type WallStyle, type WallDetectionAvailability, type WallDetectionRequest, type WallDetectionStatus,
} from "@vtt/shared";
import { api } from "../../net/api";
import type { RoomConnection } from "../../net/roomConnection";
import { WallCanvas, type CanvasMode } from "./WallCanvas";

const MODES: { key: CanvasMode; label: string; icon: typeof Eraser; needsDetection?: boolean }[] = [
  { key: "draw", label: "Draw", icon: LineSegments },
  { key: "erase", label: "Erase", icon: Eraser },
  { key: "portal", label: "Door / window", icon: Door },
  { key: "sample", label: "Detect like this", icon: Eyedropper, needsDetection: true },
  { key: "pan", label: "Pan", icon: Hand },
];

/** What the Door / window tool turns a clicked wall into (ADR 0030). "wall" makes it plain again. */
const PORTAL_KINDS: { key: PortalKind | "wall"; label: string }[] = [
  { key: "door", label: "Door" },
  { key: "window", label: "Window" },
  { key: "wall", label: "Wall" },
];
const PORTAL_STATES: { key: PortalState; label: string }[] = [
  { key: "closed", label: "Closed" },
  { key: "open", label: "Open" },
  { key: "locked", label: "Locked" },
];

const HINTS: Record<CanvasMode, string> = {
  draw: "Click to start a wall, click again to end it and start the next. Ends snap to grid corners and wall ends; hold Alt to place freely. Enter, Esc or right-click stops.",
  erase: "Click a wall to remove it. Click a blue detected wall to leave it out of Apply, and click it again to bring it back.",
  portal: "Pick what the wall should be, then click walls. Players see doors and windows outside fog and can open and close unlocked ones.",
  sample: "Click on a wall in the map: walls that look like it are detected across the whole map.",
  pan: "Drag to move around. The wheel or a pinch zooms; Space-drag or a two-finger drag pans in any mode.",
};

/**
 * The map editor's Walls step (map-editor, FR-GM-09/11): the wall canvas, and a side HUD with the
 * tools, automatic detection, its preview, and Apply and Clear. Detection controls are greyed out
 * with the reason when the server can't detect walls; drawing and erasing always work.
 */
export function WallSetup({ connection, state, token }: { connection: RoomConnection; state: RoomState; token: string }) {
  const map = state.scene.map;
  const mapUrl = map?.url ?? "";
  const wallCount = Object.keys(state.walls).length;
  const [mode, setMode] = useState<CanvasMode>("draw");
  const [portalKind, setPortalKind] = useState<PortalKind | "wall">("door");
  const [portalState, setPortalState] = useState<PortalState>("closed");
  const [availability, setAvailability] = useState<WallDetectionAvailability | null>(null);
  const [detection, setDetection] = useState<{ mapUrl: string; status: WallDetectionStatus | null }>({ mapUrl, status: null });
  const [preview, setPreview] = useState<{ mapUrl: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The detected segments waiting to be applied, and the ones the GM has erased from them (by index).
  const [candidates, setCandidates] = useState<{ mapUrl: string; resultId: string; walls: DetectedWall[]; erased: ReadonlySet<string> } | null>(null);
  const [tolerance, setTolerance] = useState(SAMPLE_TOLERANCE_DEFAULT);
  // null: automatic, the detector's own choice per map; a number is the GM's fixed setting.
  const [strictness, setStrictness] = useState<number | null>(null);
  const [minLength, setMinLength] = useState(0);
  // null: try both light stone and dark ink walls and keep the better.
  const [style, setStyle] = useState<WallStyle | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const status = detection.mapUrl === mapUrl ? detection.status : null;
  const canDetect = availability?.available === true;

  useEffect(() => {
    const abort = new AbortController();
    api.walls.availability(abort.signal)
      .then(setAvailability)
      .catch(() => { if (!abort.signal.aborted) setAvailability({ available: false, reason: "Couldn't reach the server." }); });
    return () => abort.abort();
  }, []);

  // The latest analysis of this map, then every change the server announces for it.
  useEffect(() => {
    if (!mapUrl) return;
    const abort = new AbortController();
    api.walls.status(state.roomId, token, mapUrl, abort.signal)
      .then((next) => setDetection((current) => (current.mapUrl === mapUrl && current.status ? current : { mapUrl, status: next })))
      .catch(() => {});
    const stop = connection.onWallDetection((url, next) => {
      if (url !== mapUrl) return;
      setDetection({ mapUrl, status: next });
      if (next.status === "done") setMessage({ text: `Detection found ${next.wallCount} ${next.wallCount === 1 ? "wall" : "walls"}. Check the preview, then apply.`, error: false });
      if (next.status === "failed") setMessage({ text: next.message, error: true });
    });
    return () => { abort.abort(); stop(); };
  }, [connection, state.roomId, token, mapUrl]);

  // The rendered preview, once a result is in. Fetched as a blob: it needs the GM's credential.
  const done = status?.status === "done";
  useEffect(() => {
    if (!done || !mapUrl) return;
    const abort = new AbortController();
    let objectUrl: string | null = null;
    api.walls.preview(state.roomId, token, mapUrl, abort.signal)
      .then((blob) => {
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ mapUrl, url: objectUrl });
      })
      .catch(() => {});
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [done, status, state.roomId, token, mapUrl]);

  // The detected segments themselves, so false ones can be erased on the canvas before applying.
  useEffect(() => {
    if (!done || !mapUrl) {
      setCandidates(null);
      return;
    }
    const abort = new AbortController();
    api.walls.detected(state.roomId, token, mapUrl, abort.signal)
      .then((result) => { if (!abort.signal.aborted) setCandidates({ mapUrl, ...result, erased: new Set() }); })
      .catch(() => {});
    return () => abort.abort();
  }, [done, status, state.roomId, token, mapUrl]);

  if (!map) return <p className="map-editor-empty">Apply a map in the Map step first, then set up its walls here.</p>;

  /** The detection request: the sliders' values, and the clicked wall's point when there is one. */
  const request = (sample?: Point): WallDetectionRequest => ({
    ...(sample && { sample, tolerance }),
    ...(strictness !== null && { strictness }),
    ...(style !== null && { style }),
    minLength,
  });

  const detect = async (sample?: Point) => {
    setBusy(true);
    setMessage(null);
    try {
      setDetection({ mapUrl, status: await api.walls.detect(state.roomId, token, request(sample)) });
      setMessage({ text: sample ? "Detecting walls like the one you clicked…" : "Detecting walls…", error: false });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't start wall detection", error: true });
    } finally {
      setBusy(false);
    }
  };

  const run = async (command: CommandInput, doneText?: string) => {
    const result = await connection.command(command);
    if (!result.ok) setMessage({ text: result.message, error: true });
    else if (doneText) setMessage({ text: doneText, error: false });
    return result.ok;
  };

  /** Makes the clicked wall what the Door / window tool is set to; nothing to send when it already is. */
  const markPortal = (wallId: string) => {
    const portal: Portal | null = portalKind === "wall" ? null : { kind: portalKind, state: portalState };
    const current = state.walls[wallId]?.portal ?? null;
    if (current?.kind === portal?.kind && current?.state === portal?.state) return;
    void run({ type: "portal.set", wallId, portal });
  };

  const pendingWalls = candidates?.mapUrl === mapUrl ? candidates : null;
  const candidateWalls: Record<string, Wall> = {};
  pendingWalls?.walls.forEach((w, i) => { candidateWalls[String(i)] = { id: String(i), a: w.a, b: w.b }; });
  const toggleCandidate = (key: string) => setCandidates((current) => {
    if (!current) return current;
    const erased = new Set(current.erased);
    if (!erased.delete(key)) erased.add(key);
    return { ...current, erased };
  });
  const keeping = pendingWalls ? pendingWalls.walls.length - pendingWalls.erased.size : null;

  const apply = async () => {
    const exclude = pendingWalls && pendingWalls.erased.size > 0
      ? { resultId: pendingWalls.resultId, indices: [...pendingWalls.erased].map(Number).sort((a, b) => a - b) }
      : undefined;
    const ok = await run({ type: "wall.applyDetected", mapUrl, ...(exclude && { exclude }) }, `Applied ${keeping ?? found} walls.`);
    // The result is spent: drop its overlay so the new walls aren't drawn twice.
    if (ok) setDetection({ mapUrl, status: null });
  };

  const pending = status?.status === "queued" || status?.status === "running";
  const found = status?.status === "done" ? status.wallCount : null;
  const unavailableReason = availability && !availability.available ? availability.reason ?? "Wall detection is unavailable." : null;

  return (
    <div className="map-editor-split">
      <WallCanvas
        map={map}
        grid={state.scene.grid}
        walls={state.walls}
        candidates={candidateWalls}
        erased={pendingWalls?.erased ?? new Set()}
        mode={mode}
        busy={busy}
        onAdd={(a, b) => void run({ type: "wall.add", walls: [{ a, b }] })}
        onRemove={(wallId) => void run({ type: "wall.remove", wallIds: [wallId] })}
        onPortal={markPortal}
        onToggleCandidate={toggleCandidate}
        onSample={(at) => void detect(at)}
      />
      <aside className="map-editor-hud" aria-label="Wall tools">
        <section className="stack">
          <h3 className="map-editor-heading">Tools</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label="Wall tool">
            {MODES.map(({ key, label, icon: Icon, needsDetection }) => {
              const disabled = needsDetection && !canDetect;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  className="tool-button map-editor-mode"
                  disabled={disabled}
                  title={disabled ? unavailableReason ?? "Checking wall detection…" : label}
                  onClick={() => setMode(key)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
          {mode === "portal" && (
            <div className="stack map-editor-portal">
              <OptionRow label="Make walls" options={PORTAL_KINDS} value={portalKind} onChange={setPortalKind} />
              <OptionRow label="Starting state" options={PORTAL_STATES} value={portalState} onChange={setPortalState} disabled={portalKind === "wall"} />
            </div>
          )}
          <p className="muted small-print">{HINTS[mode]}</p>
          {mode === "sample" && (
            <label className="stack">
              <span className="small-print">Colour range: {tolerance}</span>
              <input
                type="range"
                min={SAMPLE_TOLERANCE_MIN}
                max={SAMPLE_TOLERANCE_MAX}
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                aria-describedby="wall-tolerance-hint"
              />
              <span id="wall-tolerance-hint" className="muted small-print">Lower finds only walls very close to the clicked colour; higher also finds paler or darker stone, and more noise.</span>
            </label>
          )}
          <p className="map-editor-count">
            {wallCount} {wallCount === 1 ? "wall" : "walls"} on this map. Tokens can't be placed on them, and players can't move through them or through closed doors. Only you see plain walls.
          </p>
        </section>

        <section className={canDetect ? "stack" : "stack map-editor-unavailable"} aria-disabled={!canDetect}>
          <h3 className="map-editor-heading">Automatic detection</h3>
          {unavailableReason && <p className="muted">{unavailableReason} You can still draw and erase walls by hand.</p>}
          {canDetect && pending && <p className="walls-status" aria-busy="true">{status?.status === "running" ? "Detecting walls…" : "Waiting for the vision service…"}</p>}
          {canDetect && found !== null && (
            <figure className="walls-preview">
              {preview && preview.mapUrl === mapUrl ? (
                <a href={preview.url} target="_blank" rel="noreferrer" title="Open the preview full size">
                  <img src={preview.url} alt={`The map with ${found} detected ${found === 1 ? "wall" : "walls"} drawn in orange.`} />
                </a>
              ) : (
                <div className="walls-preview-placeholder" aria-hidden="true" />
              )}
              <figcaption>{found === 0 ? "No walls found on this map." : `${found} ${found === 1 ? "wall" : "walls"} found. Check them before applying; the Erase tool leaves a false one out.`}</figcaption>
            </figure>
          )}
          {canDetect && (
            <div className="stack">
              <label className="stack">
                <span className="small-print">Wall colour</span>
                <select value={style ?? "auto"} onChange={(event) => setStyle(event.target.value === "auto" ? null : (event.target.value as WallStyle))}>
                  <option value="auto">Automatic</option>
                  <option value="bright">Light stone walls</option>
                  <option value="dark">Dark ink walls</option>
                  <option value="outlined">Inked outlines (buildings, caves)</option>
                </select>
                <span className="muted small-print">Pick one if automatic detection follows the wrong thing, such as shadows instead of stone. Inked outlines suits hand-drawn maps where rooms and caves are outlined in a dark line.</span>
              </label>
              <label className="stack">
                <span className="small-print">Strictness: {strictness === null ? "automatic" : strictness.toFixed(2)}</span>
                <input
                  type="range"
                  min={STRICTNESS_MIN}
                  max={STRICTNESS_MAX}
                  step={0.05}
                  value={strictness ?? STRICTNESS_DEFAULT}
                  onChange={(event) => setStrictness(Number(event.target.value))}
                />
                <span className="muted small-print">Higher keeps only walls with a clear drawn edge: less terrain, but it can miss faint walls.</span>
                {strictness !== null && <button type="button" className="secondary" onClick={() => setStrictness(null)}>Back to automatic</button>}
              </label>
              <label className="stack">
                <span className="small-print">Shortest wall: {minLength === 0 ? "any" : `${minLength} ${minLength === 1 ? "cell" : "cells"}`}</span>
                <input
                  type="range"
                  min={0}
                  max={MIN_LENGTH_MAX}
                  step={0.5}
                  value={minLength}
                  onChange={(event) => setMinLength(Number(event.target.value))}
                />
                <span className="muted small-print">Drops short pieces such as rubble. Use Detect again to apply a change.</span>
              </label>
            </div>
          )}
          <div className="row button-row">
            <button type="button" className="secondary" disabled={!canDetect || busy || pending} onClick={() => void detect()}>
              {status ? "Detect again" : "Detect walls"}
            </button>
            {canDetect && found !== null && found > 0 && (
              <button type="button" disabled={busy || keeping === 0} onClick={() => void apply()}>
                {wallCount > 0 ? `Replace with ${keeping ?? found} walls` : `Apply ${keeping ?? found} walls`}
              </button>
            )}
          </div>
        </section>

        {wallCount > 0 && (
          <button type="button" className="secondary danger" onClick={() => void run({ type: "wall.clear" }, "Walls cleared.")}>
            Clear all walls
          </button>
        )}
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      </aside>
    </div>
  );
}

/** A small radio row for the Door / window tool's choices. */
function OptionRow<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="map-editor-option-row" role="radiogroup" aria-label={label} aria-disabled={disabled}>
      <span className="muted small-print">{label}</span>
      <div className="map-editor-options">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={value === option.key}
            className="tool-button map-editor-option"
            disabled={disabled}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
