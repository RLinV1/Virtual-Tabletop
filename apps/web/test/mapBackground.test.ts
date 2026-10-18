// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { emptyRoomState } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { DEFAULT_BOARD_SIZE } from "../src/board/gridRenderLimit";
it("clears the empty map backdrop when restoring a map with the same dimensions and grid", () => {
  const commands: string[] = [];
  const graphics = {
    clear: () => { commands.length = 0; return graphics; },
    rect: () => { commands.push("rectangle"); return graphics; },
    fill: () => { commands.push("opaque background"); return graphics; },
    moveTo: () => graphics, lineTo: () => graphics, stroke: () => graphics,
  };
  const view = Object.create(BoardView.prototype) as {
    state: ReturnType<typeof emptyRoomState>; grid: typeof graphics; gridKey: string;
    gridPreview: null; invalidate: () => void; syncGrid: () => void;
  };
  Object.assign(view, { state: emptyRoomState("r1"), grid: graphics, gridKey: "", gridPreview: null, invalidate: vi.fn() });
  view.syncGrid();
  expect(commands).toContain("opaque background");
  view.state = { ...view.state, scene: { ...view.state.scene, map: { ...DEFAULT_BOARD_SIZE, url: "/restored.png" } } };
  view.syncGrid();
  expect(commands).not.toContain("opaque background");
});
