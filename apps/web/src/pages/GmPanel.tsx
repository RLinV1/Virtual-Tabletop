import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { GridSpec, LibraryAsset, MapImage, RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { LibraryPicker } from "./LibraryPicker";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  token: string;
}

export function GmPanel({ connection, state, token }: Props) {
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
        grid={(close) => (
          <GridForm
            grid={state.scene.grid}
            onApply={async (grid, report) => {
              if (await runWith(report)(connection.command({ type: "scene.setGrid", grid }))) close();
            }}
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
  /** The grid form, shown in its own modal; `close` dismisses it after a successful apply. */
  grid: (close: () => void) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);

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
      <Modal open={gridOpen} title="Grid" onClose={() => setGridOpen(false)}>
        {props.grid(() => setGridOpen(false))}
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
  onApply,
  children,
}: {
  grid: GridSpec;
  onApply: (grid: GridSpec, report: (message: string | null) => void) => Promise<void>;
  /** "Save grid to library", when the map came from the library. */
  children?: ReactNode;
}) {
  const [draft, setDraft] = useState(grid);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(grid), [grid]);

  const field = (key: "cellSize" | "offsetX" | "offsetY" | "unitsPerCell", label: string) => (
    <label>
      {label}
      <input
        type="number"
        step="0.5"
        min={0}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <div className="stack">
      <p className="muted small-print">Match the cell size and offset to the squares drawn on your map.</p>
      <form
        className="grid-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void onApply(draft, setError);
        }}
      >
        {field("cellSize", "Cell size (px)")}
        {field("unitsPerCell", `Per cell (${draft.unitLabel})`)}
        {field("offsetX", "Offset X")}
        {field("offsetY", "Offset Y")}
        <button type="submit">Apply grid</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {children}
    </div>
  );
}
