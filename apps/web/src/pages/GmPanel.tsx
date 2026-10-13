import { Fragment, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { sameValue, inactiveLabel, pendingDepartures, undoableAction, type Command, type MapTokenPolicy, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { CheckpointsPanel } from "../panels/CheckpointsPanel";
import { EncounterPanel } from "../panels/EncounterPanel";
import { PanelSection } from "../ui/PanelSection";
import { parseGridDraft, withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { HudLayout } from "./mapEditor/HudLayout";
import { LibraryPicker } from "./LibraryPicker";
import { useGridDetection } from "./useGridDetection";
import { FogSetup } from "./mapEditor/FogSetup";
import { WallSetup } from "./mapEditor/WallSetup";
import { draftConnection } from "./mapEditor/draftConnection";
import { draftDirty, draftFrom, planDraftSave, type MapDraft } from "./mapEditor/mapDraft";
import { adjustedMessage, offersTokenPolicy, prepCommand, prepDirty, startPrep, startUvttPrep, TOKEN_POLICY_CHOICES, type MapPrep } from "./mapPrep";

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
        onSetMap={(command, report) => runWith(report)(connection.command(command))}
        onImport={(importId, revision, tokenPolicy, report) => runWith(report)(connection.command({ type: "scene.importUVTT", importId, revision, ...(tokenPolicy ? { tokenPolicy } : {}) }))}
        onGridClose={onGridDraftCancel}
        mapUrl={state.scene.map?.url ?? null}
        map={state.scene.map}
        wallCount={Object.keys(state.walls).length}
        gridApplying={gridApplying}
        room={state}
        connection={connection}
        walls={(draftConnection, draftState) => <WallSetup connection={draftConnection} state={draftState} token={token} />}
        fog={(draftConnection, draftState) => <FogSetup connection={draftConnection} state={draftState} />}
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
      <CheckpointsPanel connection={connection} state={state} />
      <EncounterPanel connection={connection} state={state} />
    </>
  );
}

function RoomGridEditor(props: ComponentProps<typeof GridForm> & {
  roomId: string; token: string; directMap: boolean;
}) {
  return props.directMap ? <DirectMapGridEditor {...props} advancedOpen /> : <GridForm {...props} advancedOpen />;
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
  onSetMap: (command: Extract<Command, { type: "scene.setMap" }>, report: (message: string | null) => void) => Promise<boolean>;
  onImport: (id: string, revision: number, policy: MapTokenPolicy | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  mapUrl: string | null;
  map: MapImage | null;
  wallCount: number;
  gridApplying: boolean;
  /** The live map's grid form; `close` is called after a successful apply or a cancel. */
  grid: (close: () => void) => ReactNode;
  /** The live room and its connection: the walls and fog draft starts from them and saves through them. */
  room: RoomState;
  connection: RoomConnection;
  /** The Walls step, editing the draft through a connection that keeps wall commands in it. */
  walls: (connection: RoomConnection, state: RoomState) => ReactNode;
  /** The Fog step, the same for fog. */
  fog: (connection: RoomConnection, state: RoomState) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [step, setStep] = useState<EditorStep>("map");
  /** The map being prepared, or null. Only this browser has it until Apply. */
  const [prep, setPrep] = useState<MapPrep | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [applyingMap, setApplyingMap] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** What to do with existing tokens (KAN-67); only asked when a map and tokens are there to move. */
  const [policy, setPolicy] = useState<MapTokenPolicy>("scale");
  /** The map just applied with tokens present, to find its Undo entry and the count it moved. */
  const [changedMapUrl, setChangedMapUrl] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const askPolicy = offersTokenPolicy(props.room);
  const uploadRef = useRef<HTMLInputElement>(null);
  const emptyUploadRef = useRef<HTMLInputElement>(null);
  const editMapRef = useRef<HTMLButtonElement>(null);
  /** Bumped when a library map is picked, so an upload still in flight can't replace that draft. */
  const prepGeneration = useRef(0);
  /** Asking "Discard changes?" before throwing away an edited draft. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /**
   * Walls and fog as the editor shows them: a private draft of the room's, saved with Save changes
   * (map-editor-drafts). Started from the room when the editor opens on a map, or the map changes.
   */
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Asking "Save changes?" before closing with unsaved walls or fog. */
  const [confirmSave, setConfirmSave] = useState(false);
  const liveMapUrl = props.map?.url ?? null;
  const [editorGeneration, setEditorGeneration] = useState(0);
  const editorSession = useMemo(() => ({ open: editorOpen, mapUrl: liveMapUrl }), [editorOpen, liveMapUrl, editorGeneration, props.roomId, props.connection]);
  const currentSession = useRef(editorSession);
  currentSession.current = editorSession;
  useEffect(() => {
    if (!editorOpen || !liveMapUrl) return setDraft(null);
    setDraft((current) => (current?.mapUrl === liveMapUrl ? current : draftFrom(props.room)));
    // Only opening the editor or a new map restarts the draft; room updates must not overwrite it.
  }, [editorOpen, liveMapUrl]);
  const draftEdits = useMemo(
    () => draftConnection(
      props.connection,
      (change) => setDraft((current) => (current && currentSession.current === editorSession && current.mapUrl === editorSession.mapUrl ? change(current) : current)),
      (mapUrl) => api.walls.detected(props.roomId, props.token, mapUrl),
      editorSession.mapUrl ?? "",
      { width: props.room.scene.map?.width ?? 0, height: props.room.scene.map?.height ?? 0 },
      () => currentSession.current === editorSession && editorSession.open,
    ),
    [props.connection, props.roomId, props.token, editorSession],
  );
  const draftState: RoomState = draft ? { ...props.room, walls: draft.walls, fog: draft.fog } : props.room;
  const unsaved = draft !== null && draftDirty(props.room, draft);
  /** Sends the draft's difference, one command at a time; stops at the first refusal. */
  const saveDraft = async (): Promise<boolean> => {
    if (!draft || saving) return false;
    setSaving(true);
    setSaveError(null);
    try {
      for (const command of planDraftSave(props.room, draft)) {
        if (currentSession.current !== editorSession) return false;
        const result = await props.connection.command(command);
        if (currentSession.current !== editorSession) return false;
        if (!result.ok) {
          setSaveError(result.message);
          return false;
        }
      }
      const saved = props.connection.snapshot?.state;
      if (saved?.scene.map?.url === draft.mapUrl) {
        setDraft((current) => current === draft && currentSession.current === editorSession ? draftFrom(saved) : current);
      }
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the map draft.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const discardDraft = () => {
    currentSession.current = { ...editorSession };
    setEditorGeneration((generation) => generation + 1);
    setDraft(draftFrom(props.room));
    setSaveError(null);
  };
  const importSession = useMemo(() => ({ id: prep?.uvtt?.id, open: editorOpen }), [prep?.uvtt?.id, editorOpen]);
  const activeImportSession = useRef(importSession); activeImportSession.current = importSession;
  const importEdits = useMemo(() => draftConnection(
    props.connection,
    (change) => setPrep((current) => {
      if (!current?.uvtt || activeImportSession.current !== importSession) return current;
      const next = change({ mapUrl: current.map.url, walls: current.walls ?? {}, fog: {} });
      return { ...current, walls: next.walls };
    }),
    async () => { throw new Error("UVTT geometry is already supplied."); },
    prep?.map.url ?? "", { width: prep?.map.width ?? 0, height: prep?.map.height ?? 0 },
    () => activeImportSession.current === importSession && importSession.open,
  ), [props.connection, prep?.map.url, prep?.map.width, prep?.map.height, importSession]);
  const importedState: RoomState | null = prep?.uvtt ? { ...props.room, scene: { ...props.room.scene, map: prep.map, grid: parseGridDraft(prep.draft, prep.map) ?? prep.initial }, walls: prep.walls ?? {}, fog: {} } : null;
  const discardPrep = () => {
    setConfirmDiscard(false);
    prepGeneration.current++;
    if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
    setPrep(null);
    setPrepError(null);
  };
  const closeEditor = () => {
    currentSession.current = { ...editorSession, open: false };
    discardPrep();
    setConfirmSave(false);
    setSaveError(null);
    setEditorOpen(false);
    props.onGridClose();
  };
  /** Every way out of the editor comes here: an edited draft asks first. */
  const requestClose = () => {
    if (applyingMap || props.gridApplying || saving) return;
    if (prep && prepDirty(prep)) setConfirmDiscard(true);
    else if (unsaved) setConfirmSave(true);
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
        applied = await props.onImport(prep.uvtt.id, revision, askPolicy ? policy : undefined, setPrepError);
      } else {
        const command = prepCommand(prep, askPolicy ? policy : undefined);
        if (command) applied = await props.onSetMap(command, setPrepError);
      }
      if (applied) { setChangedMapUrl(askPolicy ? prep.map.url : null); setUndoError(null); discardPrep(); setStep("walls"); }
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
    if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) { setEditorOpen(true); if (!prep) setStep("map"); }
    setBusy(true);
    const generation = ++prepGeneration.current;
    try {
      if (/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
        const result = await api.uvtt.prepare(props.roomId, props.token, file);
        if (generation !== prepGeneration.current) { await api.uvtt.discard(props.roomId, props.token, result.id); return; }
        if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
        setPrep(startUvttPrep(result)); setPrepError(null); setStep("grid"); setEditorOpen(true); return;
      }
      // Read the size first: a map upload carries it so the server can analyze it (grid-detection).
      const { width, height } = await imageSize(file);
      const { url } = await api.upload(file, props.token, { width, height });
      // Another map was chosen meanwhile: keep that draft and its grid edits.
      if (generation !== prepGeneration.current) return;
      // Nothing is sent yet: the upload becomes a private draft (KAN-59).
      props.onError(null);
      if (prep?.uvtt) void api.uvtt.discard(props.roomId, props.token, prep.uvtt.id).catch(() => {});
      setPrep(startPrep({ url, width, height }, undefined, props.currentGrid));
      setStep("grid");
      // An upload from the Manage tab opens the editor to line up its grid.
      setEditorOpen(true);
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // A library map starts its draft from its saved grid; Apply copies it into the room in the
  // same event (ADR 0004), and later library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
    prepGeneration.current++;
    const next = startPrep(map, asset.grid, props.currentGrid);
    if (editorOpen) {
      setPicking(false);
      setPickError(null);
      setPrep(next);
      setStep("grid");
      return;
    }
    // From the Manage tab: the library map already has its grid, so it goes straight to the table.
    const command = prepCommand(next);
    if (!command) return setPickError("This map's saved grid isn't valid. Upload it, or fix it in your library.");
    if (await props.onSetMap(command, setPickError)) setPicking(false);
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
        {props.map ? (
          <button ref={editMapRef} type="button" data-tour="gm-grid" onClick={(e) => {
            e.currentTarget.focus();
            setStep("grid");
            setEditorOpen(true);
          }}>
            Edit map
          </button>
        ) : (
          <div className="row button-row" data-tour="gm-grid">
            <label className="upload-button">
              <span>{busy ? "Uploading…" : "Upload map"}</span>
              <input
                ref={emptyUploadRef}
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                disabled={busy}
                aria-label="Upload battle map"
                onChange={(e) => {
                  void onChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {props.hasLibrary && (
              <button type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)}>
                From library
              </button>
            )}
          </div>
        )}
        {prepError && !editorOpen && <p role="alert" className="error">{prepError}</p>}
      </div>
      <Modal
        open={editorOpen}
        title="Edit map"
        className="map-editor"
        onClose={requestClose}
        onAfterClose={() => (editMapRef.current ?? emptyUploadRef.current)?.focus()}
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
            {!prep && unsaved && (
              <span className="map-editor-unsaved">
                <span className="map-editor-draft">Unsaved changes: only you see them</span>
                <button type="button" className="secondary small" disabled={saving} onClick={discardDraft}>Discard</button>
                <button type="button" className="small" disabled={saving} onClick={() => void saveDraft()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </span>
            )}
            {saveError && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
          </nav>
        )}
      >
        <div className="map-editor-shell">
          {prep?.uvtt && prep.uvtt.diagnostics.length > 0 && <details className="uvtt-diagnostics"><summary>{prep.uvtt.diagnostics.length} import warnings</summary><ul>{prep.uvtt.diagnostics.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul></details>}
          <div className="map-editor-body" role="tabpanel">
            {step === "map" && (
              <div className="map-editor-split">
                <div className="map-editor-stage">
                  {shown?.url ? <img className="map-editor-thumb" src={shown.url} alt="The current battle map" /> : <p className="map-editor-empty">No map yet. Upload one, or choose one from your library.</p>}
                </div>
                <aside className="map-editor-hud" aria-label="Map">
                  <h3 className="map-editor-heading">Battle map</h3>
                  <p className="muted">Upload a map image, or place one from your library. It stays private until you apply it with its grid.</p>
                  <label className="upload-button">
                    <span>{busy ? "Uploading…" : "Upload map"}</span>
                    <input
                      ref={uploadRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,.uvtt,.dd2vtt,.df2vtt"
                      disabled={busy}
                      aria-label="Upload battle map"
                      onChange={(e) => {
                        void onChange(e.target.files?.[0]);
                        // Cleared, so picking the same file again (after cancelling its draft) still fires.
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button type="button" className="secondary" disabled={!props.map || exporting} onClick={() => void exportMap()}>{exporting ? "Exporting…" : "Export applied map (UVTT)"}</button>
                  <p className="muted small-print">UVTT files: up to 40 MiB. Preview and edit geometry in Walls before Apply.</p>
                  {Object.values(props.room.walls).some((w) => w.portal) && <p className="muted small-print">Export preserves open/closed state. UVTT does not carry door/window identity or locks.</p>}
                  {props.hasLibrary && (
                    <button type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)}>
                      From library
                    </button>
                  )}
                  {prepError && !prep && <p role="alert" className="error">{prepError}</p>}
                </aside>
              </div>
            )}
            {step === "grid" && (prep ? (
              <HudLayout className="map-editor-grid">
            {askPolicy && (
              <fieldset className="stack token-policy">
                <legend>Tokens already on the table</legend>
                {TOKEN_POLICY_CHOICES.map((choice) => (
                  <label key={choice.value} className="checkbox">
                    <input
                      type="radio"
                      name="token-policy"
                      value={choice.value}
                      checked={policy === choice.value}
                      onChange={() => setPolicy(choice.value)}
                    />
                    <span>{choice.label} <span className="muted">{choice.hint}</span></span>
                  </label>
                ))}
              </fieldset>
            )}

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
              </HudLayout>
            ) : props.map ? (
              <HudLayout className="map-editor-grid">
            {askPolicy && (
              <fieldset className="stack token-policy">
                <legend>Tokens already on the table</legend>
                {TOKEN_POLICY_CHOICES.map((choice) => (
                  <label key={choice.value} className="checkbox">
                    <input
                      type="radio"
                      name="token-policy"
                      value={choice.value}
                      checked={policy === choice.value}
                      onChange={() => setPolicy(choice.value)}
                    />
                    <span>{choice.label} <span className="muted">{choice.hint}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
{props.grid(() => props.onGridClose())}</HudLayout>
            ) : (
              <p className="map-editor-empty">Choose a map in the Map step first.</p>
            ))}
            {step === "walls" && (importedState ? <div className="map-editor-import">
              <WallSetup key={prep?.uvtt?.id} connection={importEdits} state={importedState} token={props.token} allowDetection={false} initialMode="select" />
              <div className="map-editor-import-apply"><button type="button" disabled={applyingMap} onClick={() => void applyPrep()}>{applyingMap ? "Applying map…" : "Apply map"}</button>{prepError && <p role="alert" className="error">{prepError}</p>}</div>
            </div> : prep ? <p className="map-editor-empty">Apply this map before setting up its walls.</p> : props.walls(draftEdits, draftState))}
            {step === "fog" && (prep
              ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its fog here.</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.fog(draftEdits, draftState)}</Fragment>)}
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
          <LibraryPicker kind="map" onPick={(asset) => void place(asset)} />
          {pickError && <p role="alert" className="error">{pickError}</p>}
        </Modal>
      )}
      {changedMapUrl && (() => {
        // The newest action, if it is this map change and can still be undone.
        const latest = props.room.undo.at(-1);
        const first = latest?.events[0];
        const entry = latest && first?.type === "MapSet" && first.map?.url === changedMapUrl
          ? undoableAction(props.room.undo, latest.commandId)
          : undefined;
        const message = first?.type === "MapSet" ? adjustedMessage(first.tokenChanges?.length ?? 0) : null;
        if (!message || !entry) return null;
        return (
          <div className="row" role="status">
            <span>{message}</span>
            <button type="button" className="small secondary" onClick={async () => {
              const result = await props.connection.command({ type: "history.undo", commandId: entry.commandId });
              if (result.ok) setChangedMapUrl(null);
              else setUndoError(result.message);
            }}>
              Undo
            </button>
            {undoError && <span role="alert" className="error">{undoError}</span>}
          </div>
        );
      })()}
      <Modal open={confirmSave} title="Save changes?" onClose={() => setConfirmSave(false)}>
        <div className="stack">
          <p>You changed this map's walls or fog. Save them for the table, or discard them?</p>
          {saveError && <p role="alert" className="error">{saveError}</p>}
          <div className="row button-row">
            <button type="button" disabled={saving} onClick={async () => { if (await saveDraft()) closeEditor(); }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary" disabled={saving} onClick={closeEditor}>Discard</button>
            <button type="button" className="secondary" disabled={saving} onClick={() => setConfirmSave(false)}>Keep editing</button>
          </div>
        </div>
      </Modal>
      <Modal open={confirmDiscard} title="Discard this map?" onClose={() => setConfirmDiscard(false)}>
        <div className="stack">
          <p>You changed the grid for this map. Discard the map and your changes? The table still has its current map.</p>
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
