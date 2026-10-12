import { act, createEvent, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type CommandInput, type FogRegion, type Point, type RoomState, type Wall, type WallDetectionStatus } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";

export const MAP_URL = "/uploads/map.png";
/** 50 px cells from the origin, so snapped corners are easy to read. */
export const GRID = { ...DEFAULT_GRID, cellSize: 50, offsetX: 0, offsetY: 0 };
/** The canvas is 1:1 with the map: 800 × 600 on screen, at the screen origin. */
export const VIEW = { width: 800, height: 600 };
export const TOKEN = "gm-token";

export function room({ walls = [], fog = [], withMap = true }: { walls?: Wall[]; fog?: FogRegion[]; withMap?: boolean } = {}): RoomState {
  const state = emptyRoomState("r1");
  state.scene = { map: withMap ? { url: MAP_URL, width: VIEW.width, height: VIEW.height } : null, grid: GRID };
  state.walls = Object.fromEntries(walls.map((w) => [w.id, w]));
  state.fog = Object.fromEntries(fog.map((f) => [f.id, f]));
  return state;
}

type WallListener = (mapUrl: string, status: WallDetectionStatus) => void;

/** A connection that records commands and lets a test push a wallDetection notice. */
export function fakeConnection() {
  const commands: CommandInput[] = [];
  let listener: WallListener | null = null;
  const connection = {
    command: vi.fn(async (command: CommandInput) => {
      commands.push(command);
      return { ok: true as const };
    }),
    onWallDetection: (fn: WallListener) => {
      listener = fn;
      return () => { listener = null; };
    },
  } as unknown as RoomConnection;
  return {
    connection,
    commands,
    notify: (status: WallDetectionStatus) => act(() => { listener?.(MAP_URL, status); }),
  };
}

/** jsdom has no layout or pointer capture, and `PointerEvent` drops its coordinates. */
export function pointer(type: "pointerDown" | "pointerUp" | "pointerMove", target: Element, at: Point, init: { button?: number; id?: number } = {}) {
  const event = createEvent[type](target, {});
  Object.defineProperties(event, {
    clientX: { value: at.x }, clientY: { value: at.y }, button: { value: init.button ?? 0 }, pointerId: { value: init.id ?? 1 }, altKey: { value: false },
  });
  fireEvent(target, event);
}
export const click = (canvas: Element, at: Point) => {
  pointer("pointerDown", canvas, at);
  pointer("pointerUp", canvas, at);
};
/** Press at `from`, move, and release at `to`: a drag. */
export const drag = (canvas: Element, from: Point, to: Point) => {
  pointer("pointerDown", canvas, from);
  pointer("pointerMove", canvas, to);
  pointer("pointerUp", canvas, to);
};

/** Layout, observers, pointer capture and `<dialog>`, which jsdom lacks. Pair with `vi.restoreAllMocks`. */
export function stubMapEditorEnvironment() {
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { ...VIEW } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: VIEW.width, bottom: VIEW.height, ...VIEW, toJSON: () => ({}),
  });
  Object.assign(Element.prototype, {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
}
