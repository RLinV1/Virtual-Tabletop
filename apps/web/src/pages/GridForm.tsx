import { CaretDown } from "@phosphor-icons/react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { GRID_LINE_WIDTHS, gridLineStyle, type GridSpec, type MapImage } from "@vtt/shared";
import { gridLines } from "../board/gridLines";
import { DEFAULT_BOARD_SIZE, minimumGridCellSize, minimumGridCellSizeForDisplay } from "../board/gridRenderLimit";
import { ColorWheel } from "../ui/ColorWheel";
import { MapGridPreview } from "./MapGridPreview";
import { gridsEqual, parseGridDraft, type GridDraft } from "./gridDraft";

const DEFAULT_PREVIEW_MAP = { ...DEFAULT_BOARD_SIZE, url: null };

/**
 * Manual grid correction (FR-GM-04), shared by a room's Adjust grid and the library's
 * Edit grid. Automatic detection (FR-GM-03) will prefill these.
 */
export function GridForm({
  grid,
  map,
  draft,
  hasDraft,
  onChange,
  onCancel,
  onApply,
  applying,
  error,
  submitLabel = "Apply grid",
  busyLabel = "Applying…",
  cancelLabel = "Cancel",
  allowUnchanged = false,
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
  submitLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** An unconfigured map must be able to save an explicit grid equal to the defaults. */
  allowUnchanged?: boolean;
  /** Extra actions below the form, e.g. the room's "Save grid to library". */
  children?: ReactNode;
}) {
  const validDraft = useMemo(() => parseGridDraft(draft, map), [draft, map]);
  const [lastValid, setLastValid] = useState(grid);
  const [advanced, setAdvanced] = useState(false);
  const [geometryRevision, setGeometryRevision] = useState(0);
  const [geometryPreview, setGeometryPreview] = useState<GridSpec | null>(null);
  const [editingGeometry, setEditingGeometry] = useState(false);
  const advancedId = useId();
  const previewHelpId = useId();
  const liveGeometry = editingGeometry || applying ? null : geometryPreview;
  const submitting = useRef(false);
  useEffect(() => { if (validDraft) setLastValid(validDraft); }, [validDraft]);
  const shown = validDraft ?? lastValid;
  const canSave = !!validDraft && (allowUnchanged || !gridsEqual(validDraft, grid));
  const cellSize = Number(draft.cellSize);
  const tooManyLines = draft.cellSize.trim() !== "" && Number.isFinite(cellSize)
    && cellSize > 0 && cellSize < minimumGridCellSize(map);
  const minimumCellSize = minimumGridCellSizeForDisplay(map);
  const styleDraft = validDraft ?? {
    ...shown,
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

  const field = (key: "cellSize" | "offsetX" | "offsetY", label: string) => (
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
          value={liveGeometry ? String(liveGeometry[key]) : draft[key]}
          aria-describedby={liveGeometry ? previewHelpId : undefined}
          onChange={(e) => {
            setGeometryRevision((current) => current + 1);
            onChange({ ...draft, [key]: e.target.value });
          }}
        />
      </label>
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
              onClick={() => { if (next !== null) {
                setGeometryRevision((current) => current + 1);
                onChange({ ...draft, [key]: next });
              } }}
            >
              {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <form
      className="grid-editor"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!validDraft || !canSave || applying || submitting.current) return;
        submitting.current = true;
        void onApply(validDraft).finally(() => { submitting.current = false; });
      }}
    >
      <MapGridPreview
        map={map ?? DEFAULT_PREVIEW_MAP}
        grid={shown}
        geometryRevision={geometryRevision}
        onPreviewChange={setGeometryPreview}
        previewEnabled={!editingGeometry}
        disabled={applying}
        onChange={(next) => onChange({ ...draft,
          cellSize: String(next.cellSize), offsetX: String(next.offsetX), offsetY: String(next.offsetY),
        })}
      />
      <div className="grid-advanced">
        <button type="button" className="grid-advanced-toggle" aria-expanded={advanced}
          aria-controls={advancedId} onClick={() => setAdvanced((open) => !open)}>
          <span className="grid-advanced-title">Advanced</span>
          <CaretDown size={14} weight="bold" className="grid-advanced-caret" aria-hidden="true" />
        </button>
        <div id={advancedId} className="grid-advanced-body" hidden={!advanced}>
          <p id={previewHelpId} className="muted small-print" role="status" hidden={!liveGeometry}>
            Temporary preview values. Click the map or press Enter to confirm placement.
          </p>
          <div className="grid-form" onFocus={() => { setEditingGeometry(true); setGeometryPreview(null); }}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEditingGeometry(false); }}>
            {field("cellSize", "Cell size (px)")}
            {field("offsetX", "Offset X (px)")}
            {field("offsetY", "Offset Y (px)")}
          </div>
          <p className="muted small-print">Offsets wrap within one cell. Resizing can change them while anchor A stays fixed.</p>
          <GridLineFields draft={styleDraft} map={map} disabled={applying}
            onChange={(next) => onChange({ ...draft, lineColor: next.lineColor,
              lineWidth: next.lineWidth, lineOpacity: next.lineOpacity })}
          />
        </div>
      </div>
      <div className="grid-editor-footer">
        <div className="grid-scale">
          <span>Each square represents</span>
          <input type="number" aria-label="Distance per square" step="any" min="0" required
            disabled={applying} value={draft.unitsPerCell}
            onChange={(e) => onChange({ ...draft, unitsPerCell: e.target.value })} />
          <input type="text" aria-label="Distance unit" maxLength={12} required
            disabled={applying} value={draft.unitLabel}
            onChange={(e) => onChange({ ...draft, unitLabel: e.target.value })} />
        </div>
        {hasDraft && !validDraft && (
          <p className="error grid-message" role="alert">
            {tooManyLines
              ? `Preview is paused at the last valid values. Use a cell size of at least ${minimumCellSize} px for this map.`
              : "Preview is paused at the last valid values. Use a cell size above 0 and at most 2000 px, positive units, and offsets from 0 up to less than the cell size."}
          </p>
        )}
        {error && <p className="error grid-message" role="alert">{error}</p>}
        <div className="grid-actions">
          <button type="button" className="secondary" disabled={applying} onClick={onCancel}>{cancelLabel}</button>
          <button type="submit" disabled={!canSave || applying}>{applying ? busyLabel : submitLabel}</button>
        </div>
        {children}
      </div>
    </form>
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
function GridLineFields({ draft, map, disabled, onChange }: {
  draft: GridSpec;
  map: MapImage | null;
  disabled: boolean;
  onChange: (grid: GridSpec) => void;
}) {
  const style = gridLineStyle(draft);
  const widthIndex = Math.max(0, GRID_LINE_WIDTHS.findIndex((w) => w >= style.width));
  const opacityPct = Math.round(style.opacity * 100);
  return (
    <div className="grid-line-fields">
      <GridLinePreview grid={draft} map={map} />
      <ColorWheel label="Line colour" value={style.color} disabled={disabled} onChange={(lineColor) => onChange({ ...draft, lineColor })} />
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
          disabled={disabled}
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
          disabled={disabled}
          style={{ "--range-to": style.color } as CSSProperties}
          aria-valuetext={`${opacityPct} percent`}
          onChange={(e) => onChange({ ...draft, lineOpacity: Number(e.target.value) / 100 })}
        />
      </label>
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
  const { xs, ys } = gridLines(grid, { x: x0, y: y0, width, height });
  const lines = [...xs.map((x) => `M${x} ${y0}V${y0 + height}`), ...ys.map((y) => `M${x0} ${y}H${x0 + width}`)];
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
