import { useEffect, useState } from "react";
import { Eraser, Eyedropper, Hand, LineSegments } from "@phosphor-icons/react";
import {
  MIN_LENGTH_MAX, SAMPLE_TOLERANCE_DEFAULT, SAMPLE_TOLERANCE_MAX, SAMPLE_TOLERANCE_MIN,
  STRICTNESS_DEFAULT, STRICTNESS_MAX, STRICTNESS_MIN,
  type CommandInput, type Point, type RoomState, type WallDetectionAvailability, type WallDetectionRequest, type WallDetectionStatus,
} from "@vtt/shared";
import { api } from "../../net/api";
import type { RoomConnection } from "../../net/roomConnection";
import { WallCanvas, type CanvasMode } from "./WallCanvas";

const MODES: { key: CanvasMode; label: string; icon: typeof Eraser; needsDetection?: boolean }[] = [
  { key: "draw", label: "Draw", icon: LineSegments },
  { key: "erase", label: "Erase", icon: Eraser },
  { key: "sample", label: "Detect like this", icon: Eyedropper, needsDetection: true },
  { key: "pan", label: "Pan", icon: Hand },
];

const HINTS: Record<CanvasMode, string> = {
  draw: "Click to start a wall, click again to end it and start the next. Ends snap to grid corners and wall ends; hold Alt to place freely. Enter, Esc or right-click stops.",
  erase: "Click a wall to remove it. Undo it from the activity log.",
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
  const [availability, setAvailability] = useState<WallDetectionAvailability | null>(null);
  const [detection, setDetection] = useState<{ mapUrl: string; status: WallDetectionStatus | null }>({ mapUrl, status: null });
  const [preview, setPreview] = useState<{ mapUrl: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tolerance, setTolerance] = useState(SAMPLE_TOLERANCE_DEFAULT);
  const [strictness, setStrictness] = useState(STRICTNESS_DEFAULT);
  const [minLength, setMinLength] = useState(0);
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
        objectUrl = URL.createObjectURL(blob);
        setPreview({ mapUrl, url: objectUrl });
      })
      .catch(() => {});
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [done, status, state.roomId, token, mapUrl]);

  if (!map) return <p className="map-editor-empty">Apply a map in the Map step first, then set up its walls here.</p>;

  /** The detection request: the sliders' values, and the clicked wall's point when there is one. */
  const request = (sample?: Point): WallDetectionRequest => ({
    ...(sample && { sample, tolerance }),
    strictness,
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
        mode={mode}
        busy={busy}
        onAdd={(a, b) => void run({ type: "wall.add", walls: [{ a, b }] })}
        onRemove={(wallId) => void run({ type: "wall.remove", wallIds: [wallId] })}
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
            {wallCount} {wallCount === 1 ? "wall" : "walls"} on this map. Tokens can't be placed on them, and players can't move through them. Only you see them.
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
              <figcaption>{found === 0 ? "No walls found on this map." : `${found} ${found === 1 ? "wall" : "walls"} found. Check them before applying.`}</figcaption>
            </figure>
          )}
          {canDetect && (
            <div className="stack">
              <label className="stack">
                <span className="small-print">Strictness: {strictness.toFixed(2)}</span>
                <input
                  type="range"
                  min={STRICTNESS_MIN}
                  max={STRICTNESS_MAX}
                  step={0.05}
                  value={strictness}
                  onChange={(event) => setStrictness(Number(event.target.value))}
                />
                <span className="muted small-print">Higher keeps only walls with a clear drawn edge: less terrain, but it can miss faint walls.</span>
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
              <button type="button" disabled={busy} onClick={() => void run({ type: "wall.applyDetected", mapUrl }, `Applied ${found} walls.`)}>
                {wallCount > 0 ? `Replace with ${found} walls` : `Apply ${found} walls`}
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
