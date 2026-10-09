import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { inactiveLabel, pendingDepartures, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
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
import { withGridSuggestion, type GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { LibraryPicker } from "./LibraryPicker";
import { useGridDetection } from "./useGridDetection";
import { prepCommand, prepDirty, startPrep, type MapPrep } from "./mapPrep";

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
        token={token}
        currentGrid={state.scene.grid}
        hasLibrary={hasLibrary}
        onError={setError}
        onSetMap={(map, grid, report) => runWith(report)(connection.command({ type: "scene.setMap", map, grid }))}
        onGridClose={onGridDraftCancel}
        mapUrl={state.scene.map?.url ?? null}
        gridApplying={gridApplying}
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

/**
 * Set the battle map from a fresh upload or the GM's library (asset-library). A new map is
 * prepared privately first (KAN-59): the image and its grid are a draft in this browser until
 * Apply map sends them as one command, so the table never sees a half-aligned scene.
 */
function MapSection(props: {
  token: string;
  /** The room's grid, where a map with no saved grid starts its draft. */
  currentGrid: GridSpec;
  hasLibrary: boolean;
  onSetMap: (map: MapImage, grid: GridSpec | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  mapUrl: string | null;
  gridApplying: boolean;
  /** The live map's grid form, shown in its own modal; `close` dismisses it after a successful apply. */
  grid: (close: () => void) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  /** The map being prepared, or null. Only this browser has it until Apply. */
  const [prep, setPrep] = useState<MapPrep | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [applyingMap, setApplyingMap] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLButtonElement>(null);
  /**
   * The control that started the draft, for focus to return to. Tracked by hand: the upload
   * input is disabled while it uploads, which drops focus before the dialog can note an opener.
   */
  const prepOpener = useRef<HTMLElement | null>(null);
  /** Bumped when a library map is picked, so an upload still in flight can't replace that draft. */
  const prepGeneration = useRef(0);
  /** Asking "Discard changes?" before throwing away an edited draft. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const discardPrep = () => {
    setConfirmDiscard(false);
    setPrep(null);
    setPrepError(null);
  };
  /** Every way out of the overlay comes here: an edited draft asks first. */
  const requestClosePrep = () => {
    if (applyingMap) return;
    if (prep && prepDirty(prep)) setConfirmDiscard(true);
    else discardPrep();
  };
  const applyPrep = async () => {
    if (!prep || applyingMap) return;
    const command = prepCommand(prep);
    if (!command) return setPrepError("Fix the grid before applying the map.");
    setApplyingMap(true);
    try {
      // One command: the map and its grid reach the table together (ADR 0004).
      if (await props.onSetMap(command.map, command.grid, setPrepError)) discardPrep();
    } finally {
      setApplyingMap(false);
    }
  };
  const gridOpenRef = useRef(false);
  useEffect(() => { gridOpenRef.current = gridOpen; }, [gridOpen]);
  const previousMap = useRef(props.mapUrl);
  useEffect(() => {
    if (previousMap.current !== props.mapUrl) {
      previousMap.current = props.mapUrl;
      if (gridOpenRef.current) {
        gridOpenRef.current = false;
        setGridOpen(false);
        props.onGridClose();
      }
    }
  }, [props.mapUrl, props.onGridClose]);
  // A compact-layout switch can unmount the editor without a dialog close event.
  useEffect(() => () => {
    if (gridOpenRef.current) props.onGridClose();
  }, [props.onGridClose]);
  const closeGrid = () => {
    gridOpenRef.current = false;
    setGridOpen(false);
    props.onGridClose();
  };

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const generation = ++prepGeneration.current;
    try {
      // Read the size first: a map upload carries it so the server can analyze it (grid-detection).
      const { width, height } = await imageSize(file);
      const { url } = await api.upload(file, props.token, { width, height });
      // Another map was chosen meanwhile: keep that draft and its grid edits.
      if (generation !== prepGeneration.current) return;
      // Nothing is sent yet: the upload becomes a private draft (KAN-59).
      props.onError(null);
      prepOpener.current = uploadRef.current;
      setPrep(startPrep({ url, width, height }, undefined, props.currentGrid));
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
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
    prepOpener.current = libraryRef.current;
    setPrep(startPrep(map, asset.grid, props.currentGrid));
  };

  return (
    <PanelSection id="gm-map" title="Battle map">
      <div className="row button-row">
        <label className="upload-button secondary">
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
          <button ref={libraryRef} type="button" className="secondary" disabled={busy} onClick={() => setPicking(true)}>
            From library
          </button>
        )}
        <button type="button" className="secondary" data-tour="gm-grid" disabled={props.gridApplying} onClick={() => {
          setGridOpen(true);
        }}>
          {props.gridApplying ? "Applying grid…" : "Adjust grid"}
        </button>
      </div>
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
      <Modal
        open={prep !== null}
        title="Prepare map"
        className="prep-sheet"
        onClose={requestClosePrep}
        onAfterClose={() => prepOpener.current?.focus()}
      >
        {prep && (
          <>
            <p className="muted">Only you can see this map until you apply it. Line up the grid, then apply.</p>
            <GridForm
              key={prep.map.url}
              grid={prep.initial}
              map={prep.map}
              draft={prep.draft}
              hasDraft={prepDirty(prep)}
              onChange={(draft) => setPrep((now) => (now ? { ...now, draft } : now))}
              onCancel={requestClosePrep}
              onApply={applyPrep}
              applying={applyingMap}
              error={prepError}
              submitLabel="Apply map"
              busyLabel="Applying map…"
              allowUnchanged
            />
          </>
        )}
      </Modal>
      <Modal open={confirmDiscard} title="Discard this map?" onClose={() => setConfirmDiscard(false)}>
        <div className="stack">
          <p>You changed the grid for this map. Discard the map and your changes? The table still has its current map.</p>
          <div className="row button-row">
            <button type="button" onClick={discardPrep}>Discard</button>
            <button type="button" className="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
          </div>
        </div>
      </Modal>
      <Modal open={gridOpen} title="Edit grid" className="grid-editor-modal" onClose={() => {
        if (!props.gridApplying) closeGrid();
      }}>
        {props.grid(closeGrid)}
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
