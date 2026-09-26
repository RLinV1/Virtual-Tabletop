import type { ReactNode } from "react";
import { isBoolean, usePersistentState } from "./usePersistentState";
import { CaretDoubleLeft, CaretDoubleRight, Circle, Cursor, Eraser, LineSegment, PaintBrush, PencilSimple, Ruler, Square, Target, Trash, Triangle } from "@phosphor-icons/react";
import { AREA_SIZES, DRAW_COLORS, type AreaShape, type BoardTool, type DrawShape } from "../board/tools";

/** The options each tool remembers while another tool is active. */
export interface ToolOptions {
  draw: { shape: DrawShape; color: number };
  area: { shape: AreaShape; size: number; gmOnly: boolean };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  draw: { shape: "brush", color: DRAW_COLORS[0].value },
  area: { shape: "circle", size: 20, gmOnly: false },
};

type ToolKind = BoardTool["kind"];

const TOOLS: { kind: ToolKind; label: string; icon: ReactNode }[] = [
  { kind: "select", label: "Select", icon: <Cursor size={18} aria-hidden="true" /> },
  { kind: "measure", label: "Measure", icon: <Ruler size={18} aria-hidden="true" /> },
  { kind: "draw", label: "Draw", icon: <PencilSimple size={18} aria-hidden="true" /> },
  { kind: "area", label: "AoE", icon: <Target size={18} aria-hidden="true" /> },
  { kind: "erase", label: "Eraser", icon: <Eraser size={18} aria-hidden="true" /> },
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
];

/** Build the board tool for a rail choice, using that tool's remembered options. */
export function toolFor(kind: ToolKind, options: ToolOptions): BoardTool {
  if (kind === "draw") return { kind, ...options.draw };
  if (kind === "area") return { kind, ...options.area };
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
  active: ToolKind;
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
  if (collapsed) return <div className="tool-rail-wrap"><div className="tool-rail">{toggle}</div></div>;
  return (
    <div className="tool-rail-wrap">
      <div className="tool-rail" role="toolbar" aria-label="Board tools" aria-orientation="vertical">
        {toggle}
        {TOOLS.map((t) => (
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
