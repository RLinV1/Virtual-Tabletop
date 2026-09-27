import type { GridSpec } from "@vtt/shared";

/** A region of the board, in board pixels (invariant 8). */
export interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where grid lines fall inside `rect`: vertical lines at `xs`, horizontal lines at `ys`.
 * Lines start at the offset and step by the cell size, including one exactly on the far
 * edge. The board, the line-style sample and the library preview all draw from this, so a
 * grid lines up the same way everywhere. Callers bound the count with `canRenderGrid`.
 */
export function gridLines(grid: Pick<GridSpec, "cellSize" | "offsetX" | "offsetY">, rect: BoardRect) {
  return {
    xs: positions(grid.offsetX, grid.cellSize, rect.x, rect.x + rect.width),
    ys: positions(grid.offsetY, grid.cellSize, rect.y, rect.y + rect.height),
  };
}

function positions(offset: number, cellSize: number, start: number, end: number): number[] {
  const out: number[] = [];
  // Repeated addition, as the board has always stepped, so positions match to the bit.
  for (let at = offset + Math.ceil((start - offset) / cellSize) * cellSize; at <= end; at += cellSize) out.push(at);
  return out;
}
