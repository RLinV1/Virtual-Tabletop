import { GridSpec } from "@vtt/shared";

/** Text values let the GM clear a field while editing without turning it into zero. */
export interface GridDraft {
  cellSize: string;
  offsetX: string;
  offsetY: string;
  unitsPerCell: string;
  unitLabel: string;
}

export function toGridDraft(grid: GridSpec): GridDraft {
  return {
    cellSize: String(grid.cellSize),
    offsetX: String(grid.offsetX),
    offsetY: String(grid.offsetY),
    unitsPerCell: String(grid.unitsPerCell),
    unitLabel: grid.unitLabel,
  };
}

export function parseGridDraft(draft: GridDraft): GridSpec | null {
  if (Object.values(draft).some((value) => value.trim() === "")) return null;
  const parsed = GridSpec.safeParse({
    cellSize: Number(draft.cellSize),
    offsetX: Number(draft.offsetX),
    offsetY: Number(draft.offsetY),
    unitsPerCell: Number(draft.unitsPerCell),
    unitLabel: draft.unitLabel,
  });
  if (!parsed.success) return null;
  const grid = parsed.data;
  // GridSpec documents this canonical range, but its shared schema only checks >= 0.
  if (grid.offsetX >= grid.cellSize || grid.offsetY >= grid.cellSize) return null;
  return grid;
}

export function gridsEqual(a: GridSpec, b: GridSpec): boolean {
  return a.cellSize === b.cellSize && a.offsetX === b.offsetX && a.offsetY === b.offsetY
    && a.unitsPerCell === b.unitsPerCell && a.unitLabel === b.unitLabel;
}
