import { CaretDown } from "@phosphor-icons/react";
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { GRID_LINE_WIDTHS, gridLineStyle, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { libraryAssetId } from "../net/builtinAssets";
import { loadGmToken } from "../net/identity";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { ColorWheel } from "../ui/ColorWheel";
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
            map={state.scene.map}
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
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: libraryAssetId(asset) };
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
  map,
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
  /** Backdrop for the line-style preview. */
  map: MapImage | null;
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
  const styleDraft = validDraft ?? {
    ...grid,
    lineColor: draft.lineColor,
    lineWidth: draft.lineWidth,
    lineOpacity: draft.lineOpacity,
  };

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
        <GridLineFields
          draft={styleDraft}
          map={map}
          onChange={(next) => onChange({
            ...draft,
            lineColor: next.lineColor,
            lineWidth: next.lineWidth,
            lineOpacity: next.lineOpacity,
          })}
        />
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

const WIDTH_NAMES = ["Hairline", "Thin", "Medium", "Thick", "Bold"];

/**
 * Line colour, thickness and opacity (grid-line-style, ADR 0005), behind an "Advanced"
 * disclosure that starts closed: most GMs only ever need cell size and offset. Everything
 * here is a draft until "Apply grid", so players see nothing change while the GM tries
 * things. The preview shows the precise line style over the map inside the modal;
 * the board shows the GM's calibration overlay.
 */
function GridLineFields({ draft, map, onChange }: { draft: GridSpec; map: MapImage | null; onChange: (grid: GridSpec) => void }) {
  const [open, setOpen] = useState(false);
  const style = gridLineStyle(draft);
  const widthIndex = Math.max(0, GRID_LINE_WIDTHS.findIndex((w) => w >= style.width));
  const opacityPct = Math.round(style.opacity * 100);
  return (
    <div className="grid-advanced">
      <button
        type="button"
        className="grid-advanced-toggle"
        aria-expanded={open}
        aria-controls="grid-advanced-body"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="grid-advanced-title">Advanced</span>
        <CaretDown size={14} weight="bold" className="grid-advanced-caret" aria-hidden="true" />
      </button>
      <div id="grid-advanced-body" className="grid-advanced-body" hidden={!open}>
        <GridLinePreview grid={draft} map={map} />
        <ColorWheel label="Line colour" value={style.color} onChange={(lineColor) => onChange({ ...draft, lineColor })} />
        <label className="range-field">
          <span className="range-label">
            Thickness <span className="range-value">{GRID_LINE_WIDTHS[widthIndex]} px</span>
          </span>
          <input
            type="range"
            className="range"
            min={0}
            max={GRID_LINE_WIDTHS.length - 1}
            step={1}
            value={widthIndex}
            aria-valuetext={`${WIDTH_NAMES[widthIndex]}, ${GRID_LINE_WIDTHS[widthIndex]} pixels`}
            onChange={(e) => onChange({ ...draft, lineWidth: GRID_LINE_WIDTHS[Number(e.target.value)] })}
          />
          <span className="range-stops" aria-hidden="true">
            {WIDTH_NAMES.map((name, i) => (
              <span key={name} className={i === widthIndex ? "is-current" : undefined}>
                {name}
              </span>
            ))}
          </span>
        </label>
        <label className="range-field">
          <span className="range-label">
            Opacity <span className="range-value">{opacityPct}%</span>
          </span>
          <input
            type="range"
            className="range range-opacity"
            min={5}
            max={100}
            step={5}
            value={opacityPct}
            style={{ "--range-to": style.color } as CSSProperties}
            aria-valuetext={`${opacityPct} percent`}
            onChange={(e) => onChange({ ...draft, lineOpacity: Number(e.target.value) / 100 })}
          />
        </label>
      </div>
    </div>
  );
}

/** Cells shown across the preview; enough to read line weight against the map. */
const PREVIEW_CELLS = 5;

/**
 * The draft lines over the middle of the current map, drawn in board pixels (invariant 8)
 * so thickness reads at true proportion to the cells and the art, as on the board.
 */
function GridLinePreview({ grid, map }: { grid: GridSpec; map: MapImage | null }) {
  const style = gridLineStyle(grid);
  const width = grid.cellSize * PREVIEW_CELLS;
  const height = width * 0.4;
  const board = map ?? { url: null, width: 2100, height: 1400 };
  const x0 = Math.max(0, board.width / 2 - width / 2);
  const y0 = Math.max(0, board.height / 2 - height / 2);
  const lines: string[] = [];
  const first = (start: number, offset: number) => offset + Math.ceil((start - offset) / grid.cellSize) * grid.cellSize;
  for (let x = first(x0, grid.offsetX); x <= x0 + width; x += grid.cellSize) lines.push(`M${x} ${y0}V${y0 + height}`);
  for (let y = first(y0, grid.offsetY); y <= y0 + height; y += grid.cellSize) lines.push(`M${x0} ${y}H${x0 + width}`);
  return (
    <svg
      className="grid-line-preview"
      viewBox={`${x0} ${y0} ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Preview: ${style.color} lines, ${style.width} px, ${Math.round(style.opacity * 100)}% opacity`}
    >
      <rect x={x0} y={y0} width={width} height={height} fill="#2b2e35" />
      {board.url && <image href={board.url} x={0} y={0} width={board.width} height={board.height} />}
      <path d={lines.join("")} fill="none" stroke={style.color} strokeOpacity={style.opacity} strokeWidth={style.width} />
    </svg>
  );
}
