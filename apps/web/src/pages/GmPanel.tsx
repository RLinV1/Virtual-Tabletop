import { DraftWalls } from "./mapEditor/DraftWalls";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { sameValue, inactiveLabel, pendingDepartures, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { CheckpointsPanel } from "../panels/CheckpointsPanel";
import { EncounterPanel } from "../panels/EncounterPanel";
import { FogPanel } from "../panels/FogPanel";
import { PanelSection } from "../ui/PanelSection";
import { parseGridDraft, withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { LibraryPicker } from "./LibraryPicker";
import { useGridDetection } from "./useGridDetection";
import { FogSetup } from "./mapEditor/FogSetup";
import { WallSetup } from "./mapEditor/WallSetup";
import { prepCommand, prepDirty, startPrep, startUvttPrep, type MapPrep } from "./mapPrep";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  token: string;
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridDraftChange: (draft: GridDraft) => void;
  onGridDraftCancel: () => void;
  onGridApply: (grid: GridSpec) => Promise<boolean>;
  gridApplying: boolean;
  gridError: string | null;
  /** Opens the per-token review for a player who left (KAN-58). */
  onReviewDeparture: (participantId: string) => void;
}

/** The GM's administration section: departed players to resolve, map and grid setup, fog, then checkpoints. */
export function GmPanel({
  connection, state, token, onReviewDeparture,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  // The library belongs to the signed-in account (ADR 0017).
  const hasLibrary = useAccount().status === "signedIn";
  /** Sends a command and reports failure to `report`: the panel, or the open modal. */
  const runWith = (report: (message: string | null) => void) => async (p: Promise<CommandResult>) => {
    const result = await p;
    report(result.ok ? null : result.message);
    return result.ok;
  };

  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      <DepartedPlayers state={state} onReview={onReviewDeparture} />
      <MapSection
        roomId={state.roomId}
        token={token}
        currentGrid={state.scene.grid}
        hasLibrary={hasLibrary}
        onError={setError}
        onImport={(importId, revision, report) => runWith(report)(connection.command({ type: "scene.importUVTT", importId, revision }))}
        onSetMap={(map, grid, report) => runWith(report)(connection.command({ type: "scene.setMap", map, grid }))}
        onGridClose={onGridDraftCancel}
        mapUrl={state.scene.map?.url ?? null}
        map={state.scene.map}
        wallCount={Object.keys(state.walls).length}
        gridApplying={gridApplying}
        walls={() => <WallSetup connection={connection} state={state} token={token} />}
        fog={() => <FogSetup connection={connection} state={state} />}
        grid={(close) => (
          <RoomGridEditor
            key={state.scene.map?.url ?? "no-map"}
            roomId={state.roomId}
            token={token}
            directMap={Boolean(state.scene.map && !state.scene.map.assetId)}
            grid={state.scene.grid}
            map={state.scene.map}
            draft={gridDraft}
            hasDraft={hasGridDraft}
            onChange={onGridDraftChange}
            onCancel={close}
            onApply={async (grid) => { if (await onGridApply(grid)) close(); }}
            applying={gridApplying}
            error={gridError}
          >
            {hasLibrary && state.scene.map?.assetId && (
              <SaveGridToLibrary assetId={state.scene.map.assetId} grid={state.scene.grid} />
            )}
          </RoomGridEditor>
        )}
      />
      <FogPanel connection={connection} state={state} />
      <CheckpointsPanel connection={connection} state={state} />
      <EncounterPanel connection={connection} state={state} />
    </>
  );
}

function RoomGridEditor(props: ComponentProps<typeof GridForm> & {
  roomId: string; token: string; directMap: boolean;
}) {
  return props.directMap ? <DirectMapGridEditor {...props} /> : <GridForm {...props} />;
}

function DirectMapGridEditor(props: ComponentProps<typeof RoomGridEditor>) {
  const detection = useGridDetection("room", props.token, props.roomId, props.map?.url ?? "");
  return <GridForm
    {...props}
    detection={detection.status}
    detectionError={detection.error}
    onRetryDetection={() => { void detection.retry(); }}
    onUseSuggestion={(candidate) => props.onChange(withGridSuggestion(props.draft, candidate))}
  />;
}

/**
 * Players who left or were removed while still controlling tokens (KAN-58, FR-GM-20, ADR 0006). Derived from state, so
 * "Decide later" survives a reload, and a player drops off once nothing names them.
 */
function DepartedPlayers({ state, onReview }: { state: RoomState; onReview: (participantId: string) => void }) {
  const pending = pendingDepartures(state);
  if (pending.length === 0) return null;
  return (
    <PanelSection id="departed-players" title="Departed players">
      <ul className="plain departed-list">
        {pending.map(({ participant, tokenIds }) => (
          <li key={participant.id} className="departed-row">
            <span>
              <strong>{participant.displayName}</strong>
              <span className="muted"> {inactiveLabel(participant)}, {tokenIds.length} {tokenIds.length === 1 ? "token" : "tokens"} to decide</span>
            </span>
            <button type="button" className="small secondary" onClick={() => onReview(participant.id)}>
              Review
            </button>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

type EditorStep = "map" | "grid" | "walls" | "fog";
const STEPS: { key: EditorStep; label: string }[] = [
  { key: "map", label: "1 · Map" },
  { key: "grid", label: "2 · Grid" },
  { key: "walls", label: "3 · Walls" },
  { key: "fog", label: "4 · Fog" },
];

/**
 * Battle map setup (map-editor). The Manage tab shows a summary and Edit map, which opens a
 * full-screen editor with its own HUD: Map (upload or library), Grid, and Walls. A new map is
 * prepared privately first (KAN-59): the image and its grid are a draft in this browser until
 * Apply map sends them as one command, so the table never sees a half-aligned scene.
 */
function MapSection(props: {
  roomId: string;
  token: string;
  /** The room's grid, where a map with no saved grid starts its draft. */
  currentGrid: GridSpec;
  hasLibrary: boolean;
  onImport: (importId: string, revision: number, report: (message: string | null) => void) => Promise<boolean>;
  onSetMap: (map: MapImage, grid: GridSpec | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  mapUrl: string | null;
  map: MapImage | null;
  wallCount: number;
  gridApplying: boolean;
  /** The live map's grid form; `close` is called after a successful apply or a cancel. */
  grid: (close: () => void) => ReactNode;
  /** The Walls step: the wall canvas and its HUD. */
  walls: () => ReactNode;
  /** The Fog step: the fog canvas and its controls. */
  fog: () => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [step, setStep] = useState<EditorStep>("map");
  /** The map being prepared, or null. Only this browser has it until Apply. */
  const [prep, setPrep] = useState<MapPrep | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [applyingMap, setApplyingMap] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  /** Bumped when a library map is picked, so an upload still in flight can't replace that draft. */
  const prepGeneration = useRef(0);
  /** Asking "Discard changes?" before throwing away an edited draft. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const discardPrep = () => {
    setConfirmDiscard(false);
    prepGeneration.current++;
    if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
    setPrep(null);
    setPrepError(null);
  };
  const closeEditor = () => {
    discardPrep();
    setEditorOpen(false);
    props.onGridClose();
  };
  /** Every way out of the editor comes here: an edited draft asks first. */
  const requestClose = () => {
    if (applyingMap || props.gridApplying) return;
    if (prep && prepDirty(prep)) setConfirmDiscard(true);
    else closeEditor();
  };
  const applyPrep = async () => {
    if (!prep || applyingMap) return;
    const grid = parseGridDraft(prep.draft, prep.map);
    if (!grid) return setPrepError("Fix the grid before applying the map.");
    setApplyingMap(true); setPrepError(null);
    try {
      let applied = false;
      if (prep.uvtt) {
        let revision = prep.uvtt.revision;
        const walls = Object.values(prep.walls ?? {}).map(({ id: _id, ...wall }) => wall);
        // Avoid revising an unchanged draft on retry: a successful Apply may have lost its ack.
        if (!sameValue(grid, prep.validated?.grid) || !sameValue(walls, prep.validated?.walls)) {
          const saved = await api.uvtt.revise(props.roomId, props.token, prep.uvtt.id, { revision, grid, walls });
          revision = saved.revision;
          setPrep((now) => now?.uvtt?.id === saved.id ? { ...now, uvtt: { ...now.uvtt, revision }, walls: Object.fromEntries(saved.walls.map((w, i) => [`draft:${i}`, { ...w, id: `draft:${i}` }])), validated: { grid: saved.grid, walls: saved.walls } } : now);
        }
        applied = await props.onImport(prep.uvtt.id, revision, setPrepError);
      } else {
        const command = prepCommand(prep);
        if (command) applied = await props.onSetMap(command.map, command.grid, setPrepError);
      }
      if (applied) { discardPrep(); setStep("walls"); }
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Could not apply the map. Your draft has been kept.");
    } finally { setApplyingMap(false); }
  };
  const exportMap = async () => {
    setExporting(true); setPrepError(null);
    try {
      const blob = await api.uvtt.export(props.roomId, props.token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "map.uvtt";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setPrepError(err instanceof Error ? err.message : "Export failed."); }
    finally { setExporting(false); }
  };
  // A grid being edited belongs to the map it was edited for.
  const previousMap = useRef(props.mapUrl);
  useEffect(() => {
    if (previousMap.current !== props.mapUrl) {
      previousMap.current = props.mapUrl;
      props.onGridClose();
    }
  }, [props.mapUrl, props.onGridClose]);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const generation = ++prepGeneration.current;
    try {
      if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
        const result = await api.uvtt.prepare(props.roomId, props.token, file);
        if (generation !== prepGeneration.current) { await api.uvtt.discard(props.roomId, props.token, result.id); return; }
        if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
        setPrep(startUvttPrep(result)); setPrepError(null); setStep("grid"); return;
      }
      // Read the size first: a map upload carries it so the server can analyze it (grid-detection).
      const { width, height } = await imageSize(file);
      const { url } = await api.upload(file, props.token, { width, height });
      // Another map was chosen meanwhile: keep that draft and its grid edits.
      if (generation !== prepGeneration.current) return;
      // Nothing is sent yet: the upload becomes a private draft (KAN-59).
      props.onError(null);
      if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
      setPrepError(null);
      setPrep(startPrep({ url, width, height }, undefined, props.currentGrid));
      setStep("grid");
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // A library map starts its draft from its saved grid; Apply copies it into the room in the
  // same event (ADR 0004), and later library edits never reach back into this room.
  const place = (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
    setPicking(false);
    setPickError(null);
    prepGeneration.current++;
    if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
    setPrepError(null);
    setPrep(startPrep(map, asset.grid, props.currentGrid));
    setStep("grid");
  };

  const shown = prep?.map ?? props.map;
  return (
    <PanelSection id="gm-map" title="Battle map">
      <div className="stack">
        <p className="muted">
          {props.map
            ? `${props.map.width} × ${props.map.height} px · ${props.wallCount} ${props.wallCount === 1 ? "wall" : "walls"}`
            : "No map yet."}
        </p>
        <button type="button" data-tour="gm-grid" onClick={(e) => {
          // Safari does not focus buttons on pointer activation; give the dialog an opener.
          e.currentTarget.focus();
          setStep(props.map ? "grid" : "map");
          setEditorOpen(true);
        }}>
          Edit map
        </button>
      </div>
      <Modal
        open={editorOpen}
        title="Edit map"
        className="map-editor"
        onClose={requestClose}
        headerContent={(
          <nav className="map-editor-steps" role="tablist" aria-label="Map setup steps">
            {STEPS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={step === key}
                className="map-editor-step"
                onClick={() => setStep(key)}
              >
                {label}
              </button>
            ))}
            {prep && <span className="map-editor-draft">Draft map: only you see it until Apply map</span>}
          </nav>
        )}
      >
        <div className="map-editor-shell">
          {prep?.uvtt && prep.uvtt.diagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{prep.uvtt.diagnostics.length} import warnings</summary>
            <ul>{prep.uvtt.diagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul>
          </details>}
          <div className="map-editor-body" role="tabpanel">
            {step === "map" && (
              <div className="map-editor-split">
                <div className="map-editor-stage">
                  {shown?.url ? <img className="map-editor-thumb" src={shown.url} alt="The current battle map" /> : <p className="map-editor-empty">No map yet. Upload one, or choose one from your library.</p>}
                </div>
                <aside className="map-editor-hud" aria-label="Map">
                  <h3 className="map-editor-heading">Battle map</h3>
                  <p className="muted">Upload a map image or UVTT file (.uvtt, .dd2vtt, .df2vtt), or choose from your library. It stays private until Apply map.</p>
                  <label className="upload-button">
                    <span>{busy ? "Uploading…" : "Upload map"}</span>
                    <input
                      ref={uploadRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                      disabled={busy || applyingMap}
                      aria-label="Upload battle map"
                      onChange={(e) => {
                        void onChange(e.target.files?.[0]);
                        // Cleared, so picking the same file again (after cancelling its draft) still fires.
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="secondary" disabled={!props.map || exporting} onClick={() => void exportMap()}>{exporting ? "Exporting…" : "Export applied map (UVTT)"}</button>
                  <p className="muted small-print">UVTT files: up to 40 MiB. Preview and edit imported geometry in Walls before Apply.</p>
                  {props.hasLibrary && (
                    <button type="button" className="secondary" disabled={busy || applyingMap} onClick={() => setPicking(true)}>
                      From library
                    </button>
                  )}
                  {prepError && <p role="alert" className="error">{prepError}</p>}
                </aside>
              </div>
            )}
            {step === "grid" && (prep ? (
              <div className="map-editor-grid">
                <RoomGridEditor
                  key={prep.map.url}
                  roomId={props.roomId}
                  token={props.token}
                  directMap={!prep.uvtt && !prep.map.assetId}
                  grid={prep.initial}
                  map={prep.map}
                  draft={prep.draft}
                  hasDraft={prepDirty(prep)}
                  onChange={(draft) => setPrep((now) => (now ? { ...now, draft } : now))}
                  onCancel={requestClose}
                  onApply={applyPrep}
                  applying={applyingMap}
                  error={prepError}
                  submitLabel="Apply map"
                  busyLabel="Applying map…"
                  allowUnchanged
                />
              </div>
            ) : props.map ? (
              <div className="map-editor-grid">{props.grid(() => props.onGridClose())}</div>
            ) : (
              <p className="map-editor-empty">Choose a map in the Map step first.</p>
            ))}
            {step === "walls" && (prep?.uvtt && prep.walls ? (
              <DraftWalls map={prep.map} grid={parseGridDraft(prep.draft, prep.map) ?? prep.initial} walls={prep.walls}
                onChange={(walls) => setPrep((now) => now ? { ...now, walls } : now)} onApply={() => void applyPrep()} busy={applyingMap} error={prepError} />
            ) : prep ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its walls here.</p> : props.walls())}
            {step === "fog" && (prep
              ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its fog here.</p>
              : props.fog())}
          </div>
        </div>
      </Modal>
      {props.hasLibrary && (
        <Modal
          open={picking}
          title="Choose a map"
          onClose={() => {
            setPicking(false);
            setPickError(null);
          }}
        >
          <LibraryPicker kind="map" onPick={place} />
          {pickError && <p role="alert" className="error">{pickError}</p>}
        </Modal>
      )}
      <Modal open={confirmDiscard} title="Discard this map?" onClose={() => setConfirmDiscard(false)}>
        <div className="stack">
          <p>You changed this draft. Discard the map and your changes? The table still has its current map.</p>
          <div className="row button-row">
            <button type="button" onClick={closeEditor}>Discard</button>
            <button type="button" className="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
          </div>
        </div>
      </Modal>
    </PanelSection>
  );
}

/** Explicitly writes the room's current grid back to the library map it came from. */
function SaveGridToLibrary({ assetId, grid }: { assetId: string; grid: GridSpec }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [assetId, grid]);
  return (
    <div className="stack">
      <button
        type="button"
        className="secondary"
        disabled={status === "saving"}
        onClick={async () => {
          setStatus("saving");
          setError(null);
          try {
            await api.library.update(assetId, { grid });
            setStatus("saved");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save the grid");
            setStatus("idle");
          }
        }}
      >
        {status === "saving" ? "Saving…" : "Save grid to library"}
      </button>
      {status === "saved" && <p className="muted" role="status">Saved. Future placements of this map use this grid.</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
