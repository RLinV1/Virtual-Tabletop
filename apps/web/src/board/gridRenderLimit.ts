/** The generic board used when a room has no map image. */
export const DEFAULT_BOARD_SIZE = { width: 2100, height: 1400 };

/** Keep one grid edit from generating an unbounded number of Pixi line segments. */
export const MAX_GRID_LINES = 50_000;

export interface BoardSize {
  width: number;
  height: number;
}

export function minimumGridCellSize(board: BoardSize | null = null): number {
  const { width, height } = board ?? DEFAULT_BOARD_SIZE;
  return (width + height) / MAX_GRID_LINES;
}

/** Round upward to a value the GM can enter to the nearest hundredth of a pixel. */
export function minimumGridCellSizeForDisplay(board: BoardSize | null = null): number {
  const { width, height } = board ?? DEFAULT_BOARD_SIZE;
  return Math.ceil(((width + height) * 100) / MAX_GRID_LINES) / 100;
}

export function canRenderGrid(cellSize: number, board: BoardSize | null = null): boolean {
  return Number.isFinite(cellSize) && cellSize > 0 && cellSize >= minimumGridCellSize(board);
}
