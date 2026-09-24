import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { GridSpec, LibraryAsset, MapImage, RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { gridsEqual, parseGridDraft, type GridDraft } from "./gridDraft";
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
}

export function GmPanel({
  connection, state, token,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  // The library belongs to this device's GM identity; rooms made before it existed have none.
  const [gmToken] = useState(loadGmToken);
  /** Sends a command and reports failure to `report`: the panel, or the open modal. */
  const runWith = (report: (message: string | null) => void) => async (p: Promise<CommandResult>) => {
    const result = await p;
    report(result.ok ? null : result.message);
    return result.ok;
  };

  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      <MapSection
        token={token}
        gmToken={gmToken}
        onError={setError}
        onSetMap={(map, grid, report) => runWith(report)(connection.command({ type: "scene.setMap", map, grid }))}
        onGridClose={onGridDraftCancel}
        grid={(close) => (
          <GridForm
            grid={state.scene.grid}
            draft={gridDraft}
            hasDraft={hasGridDraft}
            onChange={onGridDraftChange}
            onCancel={close}
            onApply={async (grid) => { if (await onGridApply(grid)) close(); }}
            applying={gridApplying}
            error={gridError}
          >
            {gmToken && state.scene.map?.assetId && (
              <SaveGridToLibrary gmToken={gmToken} assetId={state.scene.map.assetId} grid={state.scene.grid} />
            )}
          </GridForm>
        )}
      />
    </>
  );
}

/** Set the battle map from a fresh upload or the GM's library (asset-library). */
function MapSection(props: {
  token: string;
  gmToken: string | null;
  onSetMap: (map: MapImage, grid: GridSpec | undefined, report: (message: string | null) => void) => Promise<boolean>;
  onError: (message: string | null) => void;
  onGridClose: () => void;
  /** The grid form, shown in its own modal; `close` dismisses it after a successful apply. */
  grid: (close: () => void) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const closeGrid = () => {
    setGridOpen(false);
    props.onGridClose();
  };

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.upload(file, props.token);
      const { width, height } = await imageSize(url);
      await props.onSetMap({ url, width, height }, undefined, props.onError);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Placing copies the saved grid into the room in the same event (ADR 0004); later
  // library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id };
    if (await props.onSetMap(map, asset.grid ?? undefined, setPickError)) setPicking(false);
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
        {props.gmToken && (
          <button type="button" className="secondary" onClick={() => setPicking(true)}>
            From library
          </button>
        )}
        <button type="button" className="secondary" data-tour="gm-grid" onClick={() => setGridOpen(true)}>
          Adjust grid
        </button>
      </div>
      {props.gmToken && (
        <Modal
          open={picking}
          title="Choose a map"
          onClose={() => {
            setPicking(false);
            setPickError(null);
          }}
        >
          <LibraryPicker gmToken={props.gmToken} kind="map" onPick={(a) => void place(a)} />
          {pickError && <p role="alert" className="error">{pickError}</p>}
        </Modal>
      )}
      <Modal open={gridOpen} title="Grid" className="grid-preview-modal" onClose={closeGrid}>
        {props.grid(closeGrid)}
      </Modal>
    </PanelSection>
  );
}

/** Explicitly writes the room's current grid back to the library map it came from. */
function SaveGridToLibrary({ gmToken, assetId, grid }: { gmToken: string; assetId: string; grid: GridSpec }) {
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
            await api.library.update(gmToken, assetId, { grid });
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

/** Manual grid correction (FR-GM-04). Automatic detection (FR-GM-03) will prefill these. */
function GridForm({
  grid,
  draft,
  hasDraft,
  onChange,
  onCancel,
  onApply,
  applying,
  error,
  children,
}: {
  grid: GridSpec;
  draft: GridDraft;
  hasDraft: boolean;
  onChange: (draft: GridDraft) => void;
  onCancel: () => void;
  onApply: (grid: GridSpec) => Promise<void>;
  applying: boolean;
  error: string | null;
  /** "Save grid to library", when the map came from the library. */
  children?: ReactNode;
}) {
  const validDraft = parseGridDraft(draft);

  const nudgedValue = (key: "cellSize" | "offsetX" | "offsetY", delta: number): string | null => {
    if (draft[key].trim() === "") return null;
    const current = Number(draft[key]);
    if (!Number.isFinite(current)) return null;
    if (key === "cellSize") {
      const next = current + delta;
      return next > 0 && next <= 2000 ? String(next) : null;
    }
    const size = Number(draft.cellSize);
    if (draft.cellSize.trim() === "" || !Number.isFinite(size) || size <= 0 || size > 2000) return null;
    return String(((current + delta) % size + size) % size);
  };

  const field = (key: "cellSize" | "offsetX" | "offsetY" | "unitsPerCell", label: string) => (
    <div className="grid-field" key={key}>
      <label>
        {label}
        <input
          type="number"
          step="any"
          min={0}
          max={key === "cellSize" ? 2000 : undefined}
          required
          disabled={applying}
          value={draft[key]}
          onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
        />
      </label>
      {key !== "unitsPerCell" && (
        <div className="grid-nudges" role="group" aria-label={`${label} nudges`}>
          {[-5, -1, 1, 5].map((delta) => {
            const next = nudgedValue(key, delta);
            return (
              <button
                key={delta}
                type="button"
                className="secondary small"
                disabled={applying || next === null}
                aria-label={`${label}: ${delta > 0 ? "increase" : "decrease"} by ${Math.abs(delta)} pixels`}
                onClick={() => { if (next !== null) onChange({ ...draft, [key]: next }); }}
              >
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="stack">
      <p className="muted small-print">Match the cell size and offset to the squares drawn on your map.</p>
      <form
        className="grid-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (validDraft && !applying && !gridsEqual(validDraft, grid)) void onApply(validDraft);
        }}
      >
        {field("cellSize", "Cell size (px)")}
        {field("unitsPerCell", `Per cell (${draft.unitLabel})`)}
        {field("offsetX", "Offset X (px)")}
        {field("offsetY", "Offset Y (px)")}
        <p className="muted grid-confidence">Confidence: manual</p>
        {hasDraft && !validDraft && (
          <p className="error grid-message" role="alert">
            Preview is paused at the last valid values. Use a cell size above 0 and at most 2000 px, positive units,
            and offsets from 0 up to less than the cell size.
          </p>
        )}
        {error && <p className="error grid-message" role="alert">{error}</p>}
        <div className="grid-actions">
          <button type="button" className="secondary" disabled={applying} onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={!validDraft || gridsEqual(validDraft, grid) || applying}>
            {applying ? "Applying…" : "Apply grid"}
          </button>
        </div>
      </form>
      {children}
    </div>
  );
}
