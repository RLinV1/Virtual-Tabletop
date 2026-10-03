import { useEffect, useRef, useState, type ReactNode } from "react";
import { inactiveLabel, normalizeLegacyGridForBoard, pendingDepartures, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { useAccount } from "../account/accountStore";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { FogPanel } from "../panels/FogPanel";
import { PanelSection } from "../ui/PanelSection";
import type { GridDraft } from "./gridDraft";
import { GridForm } from "./GridForm";
import { LibraryPicker } from "./LibraryPicker";

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

/** The GM's administration section: departed players to resolve, map and grid setup, then fog. */
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
        hasLibrary={hasLibrary}
        onError={setError}
        onSetMap={(map, grid, report) => runWith(report)(connection.command({ type: "scene.setMap", map, grid }))}
        onGridClose={onGridDraftCancel}
        gridApplying={gridApplying}
        grid={(close, setup) => (
          <GridForm
            key={JSON.stringify([state.scene.map, state.scene.grid])}
            grid={state.scene.grid}
            map={state.scene.map}
            draft={gridDraft}
            hasDraft={hasGridDraft}
            onChange={onGridDraftChange}
            onCancel={close}
            onApply={async (grid) => { if (await onGridApply(grid)) close(); }}
            applying={gridApplying}
            error={gridError}
            cancelLabel={setup ? "Set up later" : "Cancel"}
            allowUnchanged={setup}
          >
            {hasLibrary && state.scene.map?.assetId && (
              <SaveGridToLibrary assetId={state.scene.map.assetId} grid={state.scene.grid} />
            )}
          </GridForm>
        )}
      />
      <FogPanel connection={connection} state={state} />
    </>
  );
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

/** Set the battle map from a fresh upload or the GM's library (asset-library). */
function MapSection(props: {
  token: string;
  hasLibrary: boolean;
  onSetMap: (map: MapImage, grid: GridSpec | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  gridApplying: boolean;
  /** The grid form, shown in its own modal; `close` dismisses it after a successful apply. */
  grid: (close: () => void, setup: boolean) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const gridOpenRef = useRef(false);
  useEffect(() => { gridOpenRef.current = gridOpen; }, [gridOpen]);
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
    try {
      const { url } = await api.upload(file, props.token);
      const { width, height } = await imageSize(url);
      if (await props.onSetMap({ url, width, height }, undefined, props.onError)) {
        setSetup(true);
        setGridOpen(true);
      }
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Placing copies the saved grid into the room in the same event (ADR 0004); later
  // library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
    const grid = asset.grid ? normalizeLegacyGridForBoard(asset.grid, map) : undefined;
    if (await props.onSetMap(map, grid, setPickError)) {
      setPicking(false);
      if (!asset.grid) {
        setSetup(true);
        setGridOpen(true);
      }
    }
  };

  return (
    <PanelSection id="gm-map" title="Battle map">
      <div className="row button-row">
        <label className="upload-button secondary">
          <span>{busy ? "Uploading…" : "Upload map"}</span>
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            aria-label="Upload battle map"
            onChange={(e) => onChange(e.target.files?.[0])}
          />
        </label>
        {props.hasLibrary && (
          <button type="button" className="secondary" onClick={() => setPicking(true)}>
            From library
          </button>
        )}
        <button type="button" className="secondary" data-tour="gm-grid" disabled={props.gridApplying} onClick={() => {
          setSetup(false);
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
          <LibraryPicker kind="map" onPick={(a) => void place(a)} />
          {pickError && <p role="alert" className="error">{pickError}</p>}
        </Modal>
      )}
      <Modal open={gridOpen} title={setup ? "Set up grid" : "Edit grid"} className="grid-editor-modal" onClose={() => {
        if (!props.gridApplying) closeGrid();
      }}>
        {props.grid(closeGrid, setup)}
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
