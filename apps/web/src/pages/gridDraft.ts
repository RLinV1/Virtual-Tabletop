import { GridSpec, gridLineStyle } from "@vtt/shared";

/** Text values let the GM clear a field while editing without turning it into zero. */
export interface GridDraft {
  cellSize: string;
  offsetX: string;
  offsetY: string;
  unitsPerCell: string;
  unitLabel: string;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
}

export function toGridDraft(grid: GridSpec): GridDraft {
  return {
    cellSize: String(grid.cellSize),
    offsetX: String(grid.offsetX),
    offsetY: String(grid.offsetY),
    unitsPerCell: String(grid.unitsPerCell),
    unitLabel: grid.unitLabel,
    lineColor: grid.lineColor,
    lineWidth: grid.lineWidth,
    lineOpacity: grid.lineOpacity,
  };
}

export function parseGridDraft(draft: GridDraft): GridSpec | null {
  if ([draft.cellSize, draft.offsetX, draft.offsetY, draft.unitsPerCell, draft.unitLabel]
    .some((value) => value.trim() === "")) return null;
  const parsed = GridSpec.safeParse({
    cellSize: Number(draft.cellSize),
    offsetX: Number(draft.offsetX),
    offsetY: Number(draft.offsetY),
    unitsPerCell: Number(draft.unitsPerCell),
    unitLabel: draft.unitLabel,
    lineColor: draft.lineColor,
    lineWidth: draft.lineWidth,
    lineOpacity: draft.lineOpacity,
  });
  if (!parsed.success) return null;
  const grid = parsed.data;
  // GridSpec documents this canonical range, but its shared schema only checks >= 0.
  if (grid.offsetX >= grid.cellSize || grid.offsetY >= grid.cellSize) return null;
  return grid;
}

export function gridsEqual(a: GridSpec, b: GridSpec): boolean {
  const aStyle = gridLineStyle(a);
  const bStyle = gridLineStyle(b);
  return a.cellSize === b.cellSize && a.offsetX === b.offsetX && a.offsetY === b.offsetY
    && a.unitsPerCell === b.unitsPerCell && a.unitLabel === b.unitLabel
    && aStyle.color.toLowerCase() === bStyle.color.toLowerCase()
    && aStyle.width === bStyle.width && aStyle.opacity === bStyle.opacity;
}
