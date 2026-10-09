import type { ReactNode } from "react";
import { isBoolean, usePersistentState } from "./usePersistentState";
import { CaretDoubleLeft, CaretDoubleRight, Circle, CloudFog, Cursor, Eraser, Eye, LineSegment, PaintBrush, PencilSimple, Polygon, Ruler, Square, Target, Trash, Triangle } from "@phosphor-icons/react";
import { AREA_SIZES, DRAW_COLORS, type AreaShape, type BoardTool, type DrawShape, type FogMode } from "../board/tools";

/** The options each tool remembers while another tool is active. */
export interface ToolOptions {
  draw: { shape: DrawShape; color: number };
  area: { shape: AreaShape; size: number; lineCells: 1 | 2; gmOnly: boolean };
  fog: { mode: FogMode };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  draw: { shape: "brush", color: DRAW_COLORS[0].value },
  area: { shape: "circle", size: 20, lineCells: 1, gmOnly: false },
  fog: { mode: "rect" },
};

/** Tools the rail offers; Attack starts from a token instead (attack-targeting). */
type ToolKind = Exclude<BoardTool["kind"], "attack">;

const TOOLS: { kind: ToolKind; label: string; icon: ReactNode; gmOnly?: boolean }[] = [
  { kind: "select", label: "Select", icon: <Cursor size={18} aria-hidden="true" /> },
  { kind: "measure", label: "Measure", icon: <Ruler size={18} aria-hidden="true" /> },
  { kind: "draw", label: "Draw", icon: <PencilSimple size={18} aria-hidden="true" /> },
  { kind: "area", label: "AoE", icon: <Target size={18} aria-hidden="true" /> },
  { kind: "erase", label: "Eraser", icon: <Eraser size={18} aria-hidden="true" /> },
  // Players never see a fog control, not even a disabled one (FR-GM-17, INTERFACE.md).
  { kind: "fog", label: "Fog", icon: <CloudFog size={18} aria-hidden="true" />, gmOnly: true },
];

const FOG_MODES: { key: FogMode; label: string; icon: ReactNode }[] = [
  { key: "rect", label: "Fog rectangle", icon: <Square size={16} aria-hidden="true" /> },
  { key: "polygon", label: "Fog polygon", icon: <Polygon size={16} aria-hidden="true" /> },
  { key: "reveal", label: "Reveal (remove fog)", icon: <Eye size={16} aria-hidden="true" /> },
];

const DRAW_SHAPES: { shape: DrawShape; label: string; icon: ReactNode }[] = [
  { shape: "brush", label: "Brush", icon: <PaintBrush size={16} aria-hidden="true" /> },
  { shape: "line", label: "Line", icon: <LineSegment size={16} aria-hidden="true" /> },
  { shape: "rect", label: "Rectangle", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "circle", label: "Circle", icon: <Circle size={16} aria-hidden="true" /> },
];

const AREA_SHAPES: { shape: AreaShape; label: string; icon: ReactNode }[] = [
  { shape: "circle", label: "Circle", icon: <Circle size={16} aria-hidden="true" /> },
  { shape: "cone", label: "Cone", icon: <Triangle size={16} aria-hidden="true" style={{ rotate: "90deg" }} /> },
  { shape: "box", label: "Box", icon: <Square size={16} aria-hidden="true" /> },
  { shape: "line", label: "Line", icon: <LineSegment size={16} aria-hidden="true" /> },
];

/** Build the board tool for a rail choice, using that tool's remembered options. */
export function toolFor(kind: ToolKind, options: ToolOptions): BoardTool {
  if (kind === "draw") return { kind, ...options.draw };
  if (kind === "area") return { kind, ...options.area };
  if (kind === "fog") return { kind, ...options.fog };
  return { kind };
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The board's tool rail (KAN-69): Select, Measure, Draw, Area, Eraser and Clear all, plus the active
 * tool's options. Marks the tools make stay on this viewer's screen.
 */
export function ToolRail({
  active,
  options,
  unitLabel,
  isGm,
  onSelect,
  onOptions,
  onClear,
}: {
  active: BoardTool["kind"];
  options: ToolOptions;
  /** The room grid's unit label, for the area sizes. */
  unitLabel: string;
  /** The GM can place areas only they can see (ADR 0007). */
  isGm: boolean;
  onSelect: (kind: ToolKind) => void;
  onOptions: (options: ToolOptions) => void;
  onClear: () => void;
}) {
  const [collapsed, setCollapsed] = usePersistentState("vtt.ui.toolRail", false, isBoolean);
  const toggle = (
    <button
      type="button"
      className="tool-button rail-button rail-toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Show board tools" : "Hide board tools"}
      title={collapsed ? "Show board tools" : "Hide board tools"}
      onClick={() => setCollapsed((c) => !c)}
    >
      {collapsed ? <CaretDoubleRight size={14} aria-hidden="true" /> : <CaretDoubleLeft size={14} aria-hidden="true" />}
    </button>
  );
  // Hidden, the rail is just its toggle; the active tool keeps working on the board.
  // Untagged while hidden, so the guide skips its Board tools step rather than spotlight the toggle.
  if (collapsed) return <div className="tool-rail-wrap"><div className="tool-rail">{toggle}</div></div>;
  return (
    <div className="tool-rail-wrap" data-tour="tools">
      <div className="tool-rail" role="toolbar" aria-label="Board tools" aria-orientation="vertical">
        {toggle}
        {TOOLS.filter((t) => isGm || !t.gmOnly).map((t) => (
          <button
            key={t.kind}
            type="button"
            className="tool-button rail-button labelled"
            aria-pressed={active === t.kind}
            title={t.label}
            onClick={() => onSelect(t.kind)}
          >
            {t.icon}
            <span className="rail-label">{t.label}</span>
          </button>
        ))}
        <span className="rail-divider" aria-hidden="true" />
        <button type="button" className="tool-button rail-button labelled" aria-label="Clear all my marks" title="Clear all my marks" onClick={onClear}>
          <Trash size={18} aria-hidden="true" />
          <span className="rail-label">Clear</span>
        </button>
      </div>

      {active === "draw" && (
        <div className="tool-options" role="group" aria-label="Draw options">
          <Segmented
            label="Shape"
            items={DRAW_SHAPES.map((s) => ({ key: s.shape, label: s.label, icon: s.icon }))}
            value={options.draw.shape}
            onChange={(shape) => onOptions({ ...options, draw: { ...options.draw, shape } })}
          />
          <div className="tool-swatches" role="group" aria-label="Colour">
            {DRAW_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className="tool-swatch"
                aria-label={c.name}
                aria-pressed={options.draw.color === c.value}
                title={c.name}
                style={{ background: hex(c.value) }}
                onClick={() => onOptions({ ...options, draw: { ...options.draw, color: c.value } })}
              />
            ))}
          </div>
        </div>
      )}

      {active === "area" && (
        <div className="tool-options" role="group" aria-label="Area options">
          <Segmented
            label="Shape"
            items={AREA_SHAPES.map((s) => ({ key: s.shape, label: s.label, icon: s.icon }))}
            value={options.area.shape}
            onChange={(shape) => onOptions({ ...options, area: { ...options.area, shape } })}
          />
          <label className="tool-size">
            <span className="sr-only">Size when placed with a click</span>
            <select title="Size when placed with a click; drag to size it instead"
              value={options.area.size}
              onChange={(e) => onOptions({ ...options, area: { ...options.area, size: Number(e.target.value) } })}
            >
              {AREA_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} {unitLabel}
                </option>
              ))}
            </select>
          </label>
          {options.area.shape === "line" && (
            <label className="tool-size">
              <span className="sr-only">Line width</span>
              <select
                title="Line width"
                value={options.area.lineCells}
                onChange={(e) => onOptions({ ...options, area: { ...options.area, lineCells: Number(e.target.value) === 2 ? 2 : 1 } })}
              >
                <option value={1}>1 square wide</option>
                <option value={2}>2 squares wide</option>
              </select>
            </label>
          )}
          {isGm && (
            <label className="tool-check" title="Players won't see areas placed while this is on">
              <input
                type="checkbox"
                checked={options.area.gmOnly}
                onChange={(e) => onOptions({ ...options, area: { ...options.area, gmOnly: e.target.checked } })}
              />
              GM only
            </label>
          )}
        </div>
      )}
      {active === "fog" && isGm && (
        <div className="tool-options" role="group" aria-label="Fog options">
          <Segmented
            label="Fog mode"
            items={FOG_MODES}
            value={options.fog.mode}
            onChange={(mode) => onOptions({ ...options, fog: { mode } })}
          />
        </div>
      )}
    </div>
  );
}

function Segmented<K extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { key: K; label: string; icon: ReactNode }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="tool-segmented" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="tool-button rail-button"
          aria-pressed={value === item.key}
          aria-label={item.label}
          title={item.label}
          onClick={() => onChange(item.key)}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
