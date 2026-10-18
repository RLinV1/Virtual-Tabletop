import { GridActionsContext } from "./GridActionsContext";
import { Fragment, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { inactiveLabel, pendingDepartures, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize, nameFromFile } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { CheckpointsPanel } from "../panels/CheckpointsPanel";
import { EncounterPanel } from "../panels/EncounterPanel";
import { EffectsPanel } from "../panels/EffectsPanel";
import { PanelSection } from "../ui/PanelSection";
import { gridsEqual, parseGridDraft, withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { HudLayout } from "./mapEditor/HudLayout";
import { LibraryPicker } from "./LibraryPicker";
import { useGridDetection } from "./useGridDetection";
import { FogSetup } from "./mapEditor/FogSetup";
import { WallSetup } from "./mapEditor/WallSetup";
import { draftConnection } from "./mapEditor/draftConnection";
import { draftDirty, draftFrom, planDraftSave, type MapDraft } from "./mapEditor/mapDraft";
import { commandsForBoard } from "./mapEditor/libraryBoardDraft";
import { prepCommand, prepDirty, startPrep, type MapPrep } from "./mapPrep";
import { FULL_ROOM, type RoomFeatures } from "./encounterEdit/roomFeatures";

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
  /** What this room offers; a template being edited offers less (ADR 0033). */
  features?: RoomFeatures;
}

/** The GM's administration section: departed players to resolve, map and grid setup, fog, then checkpoints. */
export function GmPanel({
  connection, state, token, onReviewDeparture,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
  features = FULL_ROOM,
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
      {features.tableAdmin && <DepartedPlayers state={state} onReview={onReviewDeparture} />}
      <MapSection
        roomId={state.roomId}
        token={token}
        currentGrid={state.scene.grid}
        hasLibrary={hasLibrary}
        onError={setError}
        onSetMap={(map, grid, report) => runWith(report)(connection.command({ type: "scene.setMap", map, grid }))}
        onGridClose={onGridDraftCancel}
        gridDraft={gridDraft}
        hasGridDraft={hasGridDraft}
        onGridApply={onGridApply}
        gridError={gridError}
        mapUrl={state.scene.map?.url ?? null}
        map={state.scene.map}
        wallCount={Object.keys(state.walls).length}
        fixedMap={!features.mapAndWalls}
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
      {features.tableAdmin && (
        <>
          <CheckpointsPanel connection={connection} state={state} token={token} />
          <EncounterPanel connection={connection} state={state} />
          <EffectsPanel connection={connection} state={state} />
        </>
      )}
    </>
  );
}

function RoomGridEditor({ libraryDetectionId, ...props }: ComponentProps<typeof GridForm> & {
  roomId: string; token: string; directMap: boolean;
  /** A library map just uploaded here: its grid analysis, like a direct upload's. */
  libraryDetectionId?: string | null;
}) {
  if (libraryDetectionId) return <LibraryMapGridEditor {...props} assetId={libraryDetectionId} advancedOpen />;
  return props.directMap ? <DirectMapGridEditor {...props} advancedOpen /> : <GridForm {...props} advancedOpen />;
}

function LibraryMapGridEditor({ assetId, ...props }: ComponentProps<typeof GridForm> & { assetId: string }) {
  const detection = useGridDetection("library", "", assetId);
  return <GridForm
    {...props}
    detection={detection.status}
    detectionError={detection.error}
    onUseSuggestion={(candidate) => props.onChange(withGridSuggestion(props.draft, candidate))}
  />;
}

function DirectMapGridEditor(props: ComponentProps<typeof RoomGridEditor>) {
  const detection = useGridDetection("room", props.token, props.roomId, props.map?.url ?? "");
  return <GridForm
    {...props}
    detection={detection.status}
    detectionError={detection.error}
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
/** Manage › Battle map's ways into the editor, one per step. */
const OPENERS: { key: EditorStep; label: string }[] = [
  { key: "map", label: "Change Map" },
  { key: "grid", label: "Edit Grid" },
  { key: "walls", label: "Manage Walls" },
  { key: "fog", label: "Manage Fog" },
];
/** Unsaved work the editor asks about, and where it goes once the GM answers (map-section-step-buttons). */
type PendingKind = "map" | "grid" | "draft";
type Pending = { kind: PendingKind; then: EditorStep | "close" };
const PENDING_TEXT: Record<PendingKind, { title: string; body: string; save: string }> = {
  map: { title: "Apply this map?", body: "This map is still a draft only you can see. Apply it with its grid, or discard it? The table keeps its current map until you apply.", save: "Apply map" },
  grid: { title: "Apply grid changes?", body: "You changed this map's grid. Apply it for the table, or discard your changes?", save: "Apply grid" },
  draft: { title: "Save changes?", body: "You changed this map's walls or fog. Save them for the table, or discard them?", save: "Save" },
};
const STEPS: { key: EditorStep; label: string }[] = [
  { key: "map", label: "1 · Map" },
  { key: "grid", label: "2 · Grid" },
  { key: "walls", label: "3 · Walls" },
  { key: "fog", label: "4 · Fog" },
];
/** A template's map stays fixed while its grid, walls and fog remain editable. */
const FIXED_MAP_STEPS: { key: EditorStep; label: string }[] = [
  { key: "grid", label: "1 · Grid" },
  { key: "walls", label: "2 · Walls" },
  { key: "fog", label: "3 · Fog" },
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
  onSetMap: (map: MapImage, grid: GridSpec | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  /** The live map's grid edits, so leaving the Grid step or closing can ask about them. */
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridApply: (grid: GridSpec) => Promise<boolean>;
  gridError: string | null;
  mapUrl: string | null;
  map: MapImage | null;
  wallCount: number;
  /**
   * The map can't be changed and has no walls (a template being edited, ADR 0033): the editor
   * and its openers offer only the Grid and Fog steps.
   */
  fixedMap?: boolean;
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
  const uploadRef = useRef<HTMLInputElement>(null);
  /** Whether a map uploaded here is also kept in the account's library (on by default, ADR 0004). */
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  /** The library row made by this editor's latest upload, whose grid analysis the Grid step shows. */
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  /** Bumped when a library map is picked, so an upload still in flight can't replace that draft. */
  const prepGeneration = useRef(0);
  /**
   * Walls and fog as the editor shows them: a private draft of the room's, saved with Save changes
   * (map-editor-drafts). Started from the room when the editor opens on a map, or the map changes.
   */
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Asking about unsaved work before switching steps or closing; null when not asking. */
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingSaving, setPendingSaving] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
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
  const discardPrep = () => {
    setPrep(null);
    setPrepError(null);
  };
  const closeEditor = () => {
    currentSession.current = { ...editorSession, open: false };
    discardPrep();
    setPending(null);
    setSaveError(null);
    setEditorOpen(false);
    props.onGridClose();
  };
  /** The live map's grid as edited, or null when it doesn't parse. */
  const editedGrid = props.map ? parseGridDraft(props.gridDraft, props.map) : null;
  /** Grid edits to the live map that differ from its grid (a draft map's grid belongs to `prep`). */
  const gridDirty = !prep && props.map !== null && props.hasGridDraft && (editedGrid === null || !gridsEqual(editedGrid, props.currentGrid));
  /**
   * What leaving `from` for `to` would lose. A draft map spans Map and Grid, so uploading moves
   * between them freely; Walls and Fog share one draft, so every switch out of them saves or drops it.
   */
  const pendingFor = (from: EditorStep, to: EditorStep | "close"): PendingKind | null => {
    if (to === "close") {
      if (prep && prepDirty(prep)) return "map";
      if (gridDirty) return "grid";
      return unsaved ? "draft" : null;
    }
    if (prep && (from === "map" || from === "grid") && (to === "walls" || to === "fog")) return "map";
    if (from === "grid" && to !== "grid" && gridDirty) return "grid";
    if ((from === "walls" || from === "fog") && to !== from && unsaved) return "draft";
    return null;
  };
  const busyNow = applyingMap || props.gridApplying || saving || pendingSaving;
  const ask = (then: EditorStep | "close") => {
    const kind = pendingFor(step, then);
    if (!kind) return false;
    setPendingError(null);
    setPending({ kind, then });
    return true;
  };
  /** A step tab the GM chose: asks first when the current step has unsaved work. */
  const requestStep = (to: EditorStep) => {
    if (busyNow || to === step) return;
    if (!ask(to)) setStep(to);
  };
  /** Every way out of the editor comes here: unsaved work asks first. */
  const requestClose = () => {
    if (busyNow) return;
    if (!ask("close")) closeEditor();
  };
  const finishPending = (then: EditorStep | "close") => {
    setPending(null);
    setPendingError(null);
    if (then === "close") closeEditor();
    else setStep(then);
  };
  /** Why Save can't run for this kind of change, or null when it can. */
  const pendingBlocked = (kind: PendingKind): string | null => {
    if (kind === "map" && prep && !prepCommand(prep)) return "Fix the grid in the Grid step before applying the map.";
    if (kind === "grid" && editedGrid === null) return "Fix the grid in the Grid step before applying it.";
    return null;
  };
  const savePending = async () => {
    if (!pending || pendingSaving || pendingBlocked(pending.kind)) return;
    setPendingSaving(true);
    setPendingError(null);
    try {
      const ok = pending.kind === "map" ? await applyPrep()
        : pending.kind === "grid" ? editedGrid !== null && await props.onGridApply(editedGrid)
        : await saveDraft();
      if (ok) finishPending(pending.then);
      else if (pending.kind === "grid") setPendingError(props.gridError ?? "Couldn't apply the grid.");
    } finally {
      setPendingSaving(false);
    }
  };
  const discardPending = () => {
    if (!pending || pendingSaving) return;
    if (pending.kind === "map") discardPrep();
    else if (pending.kind === "grid") props.onGridClose();
    else discardDraft();
    finishPending(pending.then);
  };
  /** Sends the draft map with its grid; true once the table has it. */
  const applyPrep = async (): Promise<boolean> => {
    if (!prep || applyingMap) return false;
    const command = prepCommand(prep);
    if (!command) {
      setPrepError("Fix the grid before applying the map.");
      return false;
    }
    setApplyingMap(true);
    try {
      // One command: the map and its grid reach the table together (ADR 0004). Walls come next.
      if (await props.onSetMap(command.map, command.grid, setPrepError)) {
        const placed = prep.map;
        discardPrep();
        void copyLibraryBoard(placed);
        setStep("walls");
        return true;
      }
      return false;
    } finally {
      setApplyingMap(false);
    }
  };
  /**
   * A library map brings the walls and fog prepared on it (ADR 0037), adding to the walls and fog the
   * room already has. A map with none leaves them as they are.
   */
  const copyLibraryBoard = async (placed: MapImage) => {
    if (!placed.assetId || !props.hasLibrary) return;
    try {
      const board = await api.library.board(placed.assetId);
      if (board.walls.length === 0 && board.fog.length === 0) return;
      for (const command of commandsForBoard(board, placed.url)) {
        const result = await props.connection.command(command);
        if (!result.ok) throw new Error(result.message);
      }
    } catch (err) {
      props.onError(`The map was applied, but its saved walls and fog could not be added: ${err instanceof Error ? err.message : "unknown error"}`);
    }
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
      // Read the size first: a map upload carries it so the server can analyze it (grid-detection).
      const { width, height } = await imageSize(file);
      // Saved to the library, the map is a library row the room links to, so it can be reused and
      // saved in encounters; otherwise it is a direct upload that only this room knows.
      const asset = props.hasLibrary && saveToLibrary
        ? await api.library.upload(file, { kind: "map", name: nameFromFile(file), width, height })
        : null;
      const { url } = asset ?? (await api.upload(file, props.token, { width, height }));
      // Another map was chosen meanwhile: keep that draft and its grid edits.
      if (generation !== prepGeneration.current) return;
      // Nothing is sent yet: the upload becomes a private draft (KAN-59).
      props.onError(null);
      setUploadedAssetId(asset?.id ?? null);
      setPrep(startPrep({ url, width, height, ...(asset && { assetId: asset.id }) }, undefined, props.currentGrid));
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
    if (await props.onSetMap(command.map, command.grid, setPickError)) {
      setPicking(false);
      void copyLibraryBoard(map);
    }
  };

  const [gridActionSlot, setGridActionSlot] = useState<HTMLElement | null>(null);
  const shown = prep?.map ?? props.map;
  const steps = props.fixedMap ? FIXED_MAP_STEPS : STEPS;
  return (
    <PanelSection id="gm-map" title="Battle map">
      <div className="stack">
        <p className="muted">
          {props.map
            ? `${props.map.width} × ${props.map.height} px${props.fixedMap ? "" : ` · ${props.wallCount} ${props.wallCount === 1 ? "wall" : "walls"}`}`
            : "No map yet."}
        </p>
        {props.map ? (
          // Each opens the one editor on its own step; its tabs still reach the others (map-section-step-buttons).
          // A fixed map offers only the steps its editor has (ADR 0033).
          <div className="row button-row" data-tour="gm-grid">
            {OPENERS.filter(({ key }) => steps.some((s) => s.key === key)).map(({ key, label }) => (
              <button key={key} type="button" className="secondary small" onClick={() => {
                setStep(key);
                setEditorOpen(true);
              }}>
                {label}
              </button>
            ))}
          </div>
        ) : props.fixedMap ? null : (
          <div className="row button-row" data-tour="gm-grid">
            <label className="upload-button">
              <span>{busy ? "Uploading…" : "Upload map"}</span>
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
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
        headerContent={(
          <nav className="map-editor-steps" role="tablist" aria-label="Map setup steps">
            {steps.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={step === key}
                className="map-editor-step"
                onClick={() => requestStep(key)}
              >
                {label}
              </button>
            ))}
            <span ref={setGridActionSlot} hidden={step !== "grid"} style={{ marginLeft: "auto" }} />
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
          <div className="map-editor-body" role="tabpanel">
            <GridActionsContext.Provider value={gridActionSlot}>
            {step === "map" && (
              <div className="map-editor-split">
                <div className="map-editor-stage">
                  {shown?.url ? <img className="map-editor-thumb" src={shown.url} alt="The current battle map" /> : <p className="map-editor-empty">No map yet. Upload one, or choose one from your library.</p>}
                </div>
                <aside className="map-editor-hud" aria-label="Map">
                  <h3 className="map-editor-heading">Battle map</h3>
                  <p className="muted">Upload a map image, or place one from your library. It stays private until you apply it with its grid.</p>
                  {props.hasLibrary && (
                    <label className="inline">
                      <input type="checkbox" checked={saveToLibrary} disabled={busy} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                      <span>Also save uploads to my library</span>
                    </label>
                  )}
                  <label className="upload-button">
                    <span>{busy ? "Uploading…" : "Upload map"}</span>
                    <input
                      ref={uploadRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      aria-label="Upload battle map"
                      onChange={(e) => {
                        void onChange(e.target.files?.[0]);
                        // Cleared, so picking the same file again (after cancelling its draft) still fires.
                        e.target.value = "";
                      }}
                    />
                  </label>
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
                <RoomGridEditor
                  key={prep.map.url}
                  roomId={props.roomId}
                  token={props.token}
                  directMap={!prep.map.assetId}
                  libraryDetectionId={prep.map.assetId && prep.map.assetId === uploadedAssetId ? uploadedAssetId : null}
                  grid={prep.initial}
                  map={prep.map}
                  draft={prep.draft}
                  hasDraft={prepDirty(prep)}
                  onChange={(draft) => setPrep((now) => (now ? { ...now, draft } : now))}
                  onCancel={requestClose}
                  onApply={async () => { await applyPrep(); }}
                  applying={applyingMap}
                  error={prepError}
                  submitLabel="Apply map"
                  busyLabel="Applying map…"
                  allowUnchanged
                />
              </HudLayout>
            ) : props.map ? (
              <HudLayout className="map-editor-grid">{props.grid(() => props.onGridClose())}</HudLayout>
            ) : (
              <p className="map-editor-empty">Choose a map in the Map step first.</p>
            ))}
            {step === "walls" && (prep
              ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its walls here.</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.walls(draftEdits, draftState)}</Fragment>)}
            {step === "fog" && (prep
              ? <p className="map-editor-empty">Apply the draft map in the Grid step first, then set up its fog here.</p>
              : <Fragment key={`${editorGeneration}:${liveMapUrl}`}>{props.fog(draftEdits, draftState)}</Fragment>)}
            </GridActionsContext.Provider>
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
      {/* One prompt for leaving a step and for closing: Save, Discard or Keep editing (map-section-step-buttons). */}
      {(() => {
        const text = PENDING_TEXT[pending?.kind ?? "draft"];
        const blocked = pending ? pendingBlocked(pending.kind) : null;
        const error = pendingError ?? (pending?.kind === "map" ? prepError : pending?.kind === "draft" ? saveError : null);
        return (
          <Modal open={pending !== null} title={text.title} onClose={() => !pendingSaving && setPending(null)}>
            <div className="stack">
              <p>{text.body}</p>
              {blocked && <p className="muted">{blocked}</p>}
              {error && <p role="alert" className="error">{error}</p>}
              <div className="row button-row">
                <button type="button" disabled={pendingSaving || blocked !== null} onClick={() => void savePending()}>
                  {pendingSaving ? "Saving…" : text.save}
                </button>
                <button type="button" className="secondary" disabled={pendingSaving} onClick={discardPending}>Discard</button>
                <button type="button" className="secondary" disabled={pendingSaving} onClick={() => setPending(null)}>Keep editing</button>
              </div>
            </div>
          </Modal>
        );
      })()}
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
