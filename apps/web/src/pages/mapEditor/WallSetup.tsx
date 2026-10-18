import { useEffect, useRef, useState } from "react";
import { Cursor, Door, Eraser, Eyedropper, LineSegments } from "@phosphor-icons/react";
import {
  isDoubtfulWall, MIN_LENGTH_MAX, SAMPLE_TOLERANCE_DEFAULT, SAMPLE_TOLERANCE_MAX, SAMPLE_TOLERANCE_MIN,
  STRICTNESS_DEFAULT, STRICTNESS_MAX, STRICTNESS_MIN,
  type CommandInput, type DetectedWall, type Point, type Portal, type PortalKind, type PortalState, type RoomState, type Wall, type WallStyle, type WallDetectionAvailability, type WallDetectionRequest, type WallDetectionStatus,
} from "@vtt/shared";
import { api } from "../../net/api";
import { useRoomSnapshot, type EditorConnection } from "../../net/roomConnection";
import { WallProperties } from "./WallProperties";
import { DOUBTFUL_COLOR, WallCanvas, type CanvasMode } from "./WallCanvas";
import { HudLayout } from "./HudLayout";

const MODES: { key: CanvasMode; label: string; icon: typeof Eraser; needsDetection?: boolean }[] = [
  { key: "select", label: "Select", icon: Cursor },
  { key: "draw", label: "Draw", icon: LineSegments },
  { key: "erase", label: "Erase", icon: Eraser },
  { key: "portal", label: "Door", icon: Door },
  { key: "sample", label: "Pick", icon: Eyedropper, needsDetection: true },
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
  select: "Select geometry on the map, or choose it below, to edit its endpoints and metadata.",
  draw: "Click to start a wall, click again to end it. Alt places freely; Esc stops.",
  erase: "Click a wall to remove it, or a blue detected wall to leave it out.",
  portal: "Pick a type, then click walls.",
  sample: "Click a wall to find walls like it.",
};

/**
 * The map editor's Walls step (map-editor, FR-GM-09/11): the wall canvas, and a side HUD with the
 * tools, automatic detection, its preview, and Apply and Clear. Detection controls are hidden
 * when the server can't detect walls; drawing and erasing always work.
 */
export function WallSetup({ connection, state, token, detection: detectionEnabled = true, initialMode = "draw" }: {
  connection: EditorConnection;
  state: RoomState;
  token: string;
  /** False where there is no room to run detection against (a library map): the detection controls are left out. */
  detection?: boolean;
  initialMode?: CanvasMode;
}) {
  const map = state.scene.map;
  const mapUrl = map?.url ?? "";
  const wallCount = Object.keys(state.walls).length;
  const [mode, setMode] = useState<CanvasMode>(initialMode);
  const [selected, setSelected] = useState<string>("");
  const [portalKind, setPortalKind] = useState<PortalKind | "wall">("door");
  const [portalState, setPortalState] = useState<PortalState>("closed");
  const [availability, setAvailability] = useState<WallDetectionAvailability | null>(null);
  const [detection, setDetection] = useState<{ mapUrl: string; status: WallDetectionStatus | null }>({ mapUrl, status: null });
  const [preview, setPreview] = useState<{ mapUrl: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The detected segments waiting to be applied, the ones the GM has erased from them (by index), and
  // the position in the doubtful walls while reviewing them (null: not reviewing).
  const [candidates, setCandidates] = useState<{ mapUrl: string; resultId: string; walls: DetectedWall[]; erased: ReadonlySet<string>; review: number | null } | null>(null);
  const [tolerance, setTolerance] = useState(SAMPLE_TOLERANCE_DEFAULT);
  // null: automatic, the detector's own choice per map; a number is the GM's fixed setting.
  const [strictness, setStrictness] = useState<number | null>(null);
  const [minLength, setMinLength] = useState(0);
  // null: try both light stone and dark ink walls and keep the better.
  const [style, setStyle] = useState<WallStyle | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const { snapshots } = useRoomSnapshot(connection);
  // Counts the changes to `detection` made by a notice or a Detect click, so a slower status fetch never overwrites them.
  const detectionChanges = useRef(0);
  const status = detection.mapUrl === mapUrl ? detection.status : null;
  // Detection is offered only while the vision service is up; otherwise its controls are left out, not greyed.
  const canDetect = detectionEnabled && availability?.available === true;

  useEffect(() => {
    if (!detectionEnabled) return;
    const abort = new AbortController();
    api.walls.availability(abort.signal)
      .then(setAvailability)
      .catch(() => { if (!abort.signal.aborted) setAvailability({ available: false, reason: "Couldn't reach the server." }); });
    return () => abort.abort();
  }, [detectionEnabled]);

  // The latest analysis of this map, then every change the server announces for it.
  useEffect(() => {
    if (!mapUrl || !detectionEnabled) return;
    const abort = new AbortController();
    const started = detectionChanges.current;
    api.walls.status(state.roomId, token, mapUrl, abort.signal)
      .then((next) => setDetection((current) => (detectionChanges.current !== started && current.mapUrl === mapUrl ? current : { mapUrl, status: next })))
      .catch(() => {});
    const stop = connection.onWallDetection((url, next) => {
      if (url !== mapUrl) return;
      detectionChanges.current += 1;
      setDetection({ mapUrl, status: next });
      if (next.status === "done") setMessage({ text: `Detection found ${next.wallCount} ${next.wallCount === 1 ? "wall" : "walls"}. Check the preview, then apply.`, error: false });
      if (next.status === "failed") setMessage({ text: next.message, error: true });
    });
    return () => { abort.abort(); stop(); };
  }, [connection, state.roomId, token, mapUrl, snapshots, detectionEnabled]);

  // The rendered preview, once a result is in. Fetched as a blob: it needs the GM's credential.
  const done = status?.status === "done";
  useEffect(() => {
    if (!done || !mapUrl || !detectionEnabled) return;
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
    if (!done || !mapUrl || !detectionEnabled) {
      setCandidates(null);
      return;
    }
    const abort = new AbortController();
    api.walls.detected(state.roomId, token, mapUrl, abort.signal)
      .then((result) => { if (!abort.signal.aborted) setCandidates({ mapUrl, ...result, erased: new Set(), review: null }); })
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
      const started = await api.walls.detect(state.roomId, token, request(sample));
      detectionChanges.current += 1;
      setDetection({ mapUrl, status: started });
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
  // Walls the model was unsure about (wall-review): every one, and how many the GM has not yet erased.
  const doubtfulKeys = new Set<string>();
  pendingWalls?.walls.forEach((w, i) => { if (isDoubtfulWall(w)) doubtfulKeys.add(String(i)); });
  const doubtfulKeyList = [...doubtfulKeys];
  const doubtfulLeft = doubtfulKeyList.filter((key) => !pendingWalls?.erased.has(key)).length;
  const confident = pendingWalls ? pendingWalls.walls.length - new Set([...pendingWalls.erased, ...doubtfulKeys]).size : 0;
  const reviewing = pendingWalls?.review ?? null;
  const reviewKey = reviewing === null ? null : doubtfulKeyList[reviewing] ?? null;
  const setReview = (review: number | null) => setCandidates((current) => (current ? { ...current, review } : current));
  /** Steps to the next doubtful wall, or ends the review after the last. */
  const reviewStep = (by: number) => {
    if (reviewing === null) return;
    const next = reviewing + by;
    setReview(next >= 0 && next < doubtfulKeyList.length ? next : by > 0 ? null : 0);
  };
  const eraseReviewed = () => {
    if (reviewKey === null || !pendingWalls) return;
    const wasErased = pendingWalls.erased.has(reviewKey);
    toggleCandidate(reviewKey);
    if (!wasErased) reviewStep(1);
  };

  /** Applies the detected walls; `confidentOnly` also leaves out the doubtful ones, as if the GM had erased them. */
  const apply = async (confidentOnly = false) => {
    const left = confidentOnly ? new Set([...(pendingWalls?.erased ?? []), ...doubtfulKeys]) : pendingWalls?.erased ?? new Set<string>();
    const exclude = pendingWalls && left.size > 0
      ? { resultId: pendingWalls.resultId, indices: [...left].map(Number).sort((a, b) => a - b) }
      : undefined;
    const count = pendingWalls ? pendingWalls.walls.length - left.size : found;
    const ok = await run({ type: "wall.applyDetected", mapUrl, ...(exclude && { exclude }) }, `Applied ${count} walls.`);
    // The result is spent: drop its overlay so the new walls aren't drawn twice.
    if (ok) setDetection({ mapUrl, status: null });
  };

  const pending = status?.status === "queued" || status?.status === "running";
  const found = status?.status === "done" ? status.wallCount : null;

  return (
    <HudLayout className="map-editor-split">
      <WallCanvas
        map={map}
        grid={state.scene.grid}
        walls={state.walls}
        candidates={candidateWalls}
        erased={pendingWalls?.erased ?? new Set()}
        doubtful={doubtfulKeys}
        focus={reviewKey}
        mode={mode}
        busy={busy}
        onAdd={(a, b) => void run({ type: "wall.add", walls: [{ a, b }] })}
        onRemove={(wallId) => void run({ type: "wall.remove", wallIds: [wallId] })}
        onPortal={markPortal}
        onSelect={setSelected}
        selected={selected}
        onToggleCandidate={toggleCandidate}
        onSample={(at) => void detect(at)}
      />
      <aside className="map-editor-hud" aria-label="Wall tools">
        <section className="stack">
          <h3 className="map-editor-heading">Tools</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label="Wall tool">
            {MODES.filter(({ needsDetection }) => !needsDetection || canDetect).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                className="tool-button map-editor-mode"
                title={label}
                onClick={() => setMode(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {mode === "portal" && (
            <div className="stack map-editor-portal">
              <OptionRow label="Make walls" options={PORTAL_KINDS} value={portalKind} onChange={setPortalKind} />
              <OptionRow label="Starting state" options={PORTAL_STATES} value={portalState} onChange={setPortalState} disabled={portalKind === "wall"} />
            </div>
          )}
          <p className="muted small-print">{HINTS[mode]}</p>
          <label className="stack">Selected geometry
            <select value={state.walls[selected] ? selected : ""} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a wall, door or window</option>
              {Object.values(state.walls).map((wall, i) => <option key={wall.id} value={wall.id}>{wall.portal?.kind === "window" ? "Window" : wall.portal || wall.uvttPortal ? "Door" : "Wall"} {i + 1}</option>)}
            </select>
          </label>
          {state.walls[selected] && <WallProperties key={JSON.stringify(state.walls[selected])} wall={state.walls[selected]!} map={map} disabled={busy} onSave={async (wall) => {
            const result = await connection.command({ type: "wall.update", wall });
            if (!result.ok) throw new Error(result.message);
          }} />}
          {mode === "sample" && (
            <label className="stack">
              <span className="small-print">Colour range: {tolerance}</span>
              <input
                type="range"
                min={SAMPLE_TOLERANCE_MIN}
                max={SAMPLE_TOLERANCE_MAX}
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                title="Lower finds only walls close to the clicked colour; higher finds paler or darker ones, and more noise."
              />
            </label>
          )}
          <p className="map-editor-count">
            {wallCount} {wallCount === 1 ? "wall" : "walls"}. Middle-drag or Space-drag pans.
          </p>
        </section>

        {canDetect && <section className="stack">
          <h3 className="map-editor-heading">Automatic detection</h3>
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
              <figcaption>{found === 0 ? "No walls found." : `${found} ${found === 1 ? "wall" : "walls"} found.`}</figcaption>
            </figure>
          )}
          {canDetect && pendingWalls && doubtfulKeys.size > 0 && (
            <div className="stack walls-review">
              <ul className="walls-legend" aria-label="Detected wall colours">
                <li><span className="walls-legend-swatch" aria-hidden="true" />Detected</li>
                <li><span className="walls-legend-swatch doubtful" style={{ borderColor: DOUBTFUL_COLOR }} aria-hidden="true" />Doubtful</li>
              </ul>
              <p className="walls-status" role="status">{doubtfulLeft} doubtful {doubtfulLeft === 1 ? "wall" : "walls"}</p>
              {reviewing === null ? (
                <button type="button" className="secondary" disabled={doubtfulLeft === 0} onClick={() => setReview(0)}>Review doubtful walls</button>
              ) : (
                <div className="stack" role="group" aria-label="Review doubtful walls">
                  <p className="small-print">Wall {reviewing + 1} of {doubtfulKeyList.length}{reviewKey !== null && pendingWalls.erased.has(reviewKey) ? " (erased)" : ""}</p>
                  <div className="row button-row">
                    <button type="button" className="secondary" disabled={reviewing === 0} onClick={() => reviewStep(-1)}>Back</button>
                    <button type="button" className="secondary" onClick={eraseReviewed}>{reviewKey !== null && pendingWalls.erased.has(reviewKey) ? "Bring back" : "Erase"}</button>
                    <button type="button" className="secondary" onClick={() => reviewStep(1)}>{reviewing === doubtfulKeyList.length - 1 ? "Finish" : "Keep"}</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {canDetect && (
            <div className="stack">
              <label className="stack">
                <span className="small-print">Wall colour</span>
                <select title="Pick one if automatic detection follows shadows instead of walls." value={style ?? "auto"} onChange={(event) => setStyle(event.target.value === "auto" ? null : (event.target.value as WallStyle))}>
                  <option value="auto">Automatic</option>
                  <option value="bright">Light stone walls</option>
                  <option value="dark">Dark ink walls</option>
                  <option value="outlined">Inked outlines (buildings, caves)</option>
                </select>
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
                  title="Higher keeps only walls with a clear drawn edge; it can miss faint ones."
                />
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
                  title="Drops short pieces such as rubble. Detect again to apply."
                />
              </label>
            </div>
          )}
          <div className="row button-row walls-actions">
            <button type="button" className="secondary" disabled={!canDetect || busy || pending} onClick={() => void detect()}>
              {status ? "Detect again" : "Detect walls"}
            </button>
            {canDetect && found !== null && found > 0 && (
              <button type="button" disabled={busy || keeping === 0} onClick={() => void apply()}>
                {wallCount > 0 ? `Replace with ${keeping ?? found} walls` : `Apply ${keeping ?? found} walls`}
              </button>
            )}
            {canDetect && found !== null && found > 0 && doubtfulLeft > 0 && (
              <button type="button" className="secondary" disabled={busy || confident === 0} onClick={() => void apply(true)}>
                Apply confident walls only ({confident})
              </button>
            )}
          </div>
        </section>}

        {wallCount > 0 && (
          <button type="button" className="secondary danger" onClick={() => void run({ type: "wall.clear" }, "Walls cleared.")}>
            Clear all walls
          </button>
        )}
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      </aside>
    </HudLayout>
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
