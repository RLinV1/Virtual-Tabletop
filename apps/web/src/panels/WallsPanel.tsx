import { useEffect, useState } from "react";
import type { RoomState, WallDetectionStatus } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";

/**
 * Automatic walls (FR-GM-11, ADR 0025), GM only. A map upload, or Detect walls, sends the map to
 * the vision service through the job queue; the server tells this panel when it is done, and the
 * GM reviews the rendered preview before Apply walls commits them. Walls stop tokens being placed
 * across them and stop players moving through them.
 */
export function WallsPanel({ connection, state, token }: { connection: RoomConnection; state: RoomState; token: string }) {
  const map = state.scene.map;
  const mapUrl = map?.url ?? "";
  const wallCount = Object.keys(state.walls).length;
  const [detection, setDetection] = useState<{ mapUrl: string; status: WallDetectionStatus | null }>({ mapUrl, status: null });
  const [preview, setPreview] = useState<{ mapUrl: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const status = detection.mapUrl === mapUrl ? detection.status : null;

  // The latest analysis of this map, then every change the server announces for it.
  useEffect(() => {
    if (!mapUrl) return;
    const abort = new AbortController();
    setError(null);
    api.walls.status(state.roomId, token, mapUrl, abort.signal)
      .then((next) => setDetection((current) => (current.mapUrl === mapUrl && current.status ? current : { mapUrl, status: next })))
      .catch((err: unknown) => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Couldn't check wall detection"); });
    const stop = connection.onWallDetection((url, next) => {
      if (url !== mapUrl) return;
      setDetection({ mapUrl, status: next });
      if (next.status === "done") setAnnounce(`Wall detection found ${next.wallCount} ${next.wallCount === 1 ? "wall" : "walls"}.`);
      if (next.status === "failed") setAnnounce("Wall detection failed.");
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

  const detect = async () => {
    setBusy(true);
    setError(null);
    try {
      setDetection({ mapUrl, status: await api.walls.detect(state.roomId, token) });
      setAnnounce("Detecting walls…");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start wall detection");
    } finally {
      setBusy(false);
    }
  };

  const run = async (command: Parameters<RoomConnection["command"]>[0], doneMessage: string) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) setAnnounce(doneMessage);
  };

  const pending = status?.status === "queued" || status?.status === "running";
  const found = status?.status === "done" ? status.wallCount : null;

  return (
    <PanelSection id="gm-walls" title="Walls">
      {!map ? (
        <p className="muted">Set a battle map to detect its walls.</p>
      ) : (
        <div className="stack walls-panel">
          <p className="muted">
            {wallCount > 0
              ? `${wallCount} ${wallCount === 1 ? "wall is" : "walls are"} on this map. Tokens can't be placed on them, and players can't move through them. Only you see them.`
              : "No walls yet. Detect them from the map, review the preview, then apply."}
          </p>
          {pending && <p className="walls-status" aria-busy="true">{status?.status === "running" ? "Detecting walls…" : "Waiting for the vision service…"}</p>}
          {status?.status === "failed" && <p className="error">{status.message}</p>}
          {found !== null && (
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
          <div className="row button-row">
            <button type="button" className="secondary" disabled={busy || pending} onClick={() => void detect()}>
              {status ? "Detect again" : "Detect walls"}
            </button>
            {found !== null && found > 0 && (
              <button type="button" disabled={busy} onClick={() => void run(
                { type: "wall.applyDetected", mapUrl },
                `Applied ${found} ${found === 1 ? "wall" : "walls"}.`,
              )}>
                {wallCount > 0 ? `Replace with ${found} walls` : `Apply ${found} walls`}
              </button>
            )}
            {wallCount > 0 && (
              <button type="button" className="secondary danger" disabled={busy} onClick={() => void run({ type: "wall.clear" }, "Walls cleared.")}>
                Clear walls
              </button>
            )}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="sr-only" role="status">{announce}</p>
        </div>
      )}
    </PanelSection>
  );
}
