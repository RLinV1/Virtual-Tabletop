// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type CommandInput, type Point, type RoomState, type Wall, type WallDetectionStatus } from "@vtt/shared";
import { api } from "../src/net/api";
import type { RoomConnection } from "../src/net/roomConnection";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { WallSetup } from "../src/pages/mapEditor/WallSetup";

// The panels below the map section have nothing to do with the editor.
vi.mock("../src/panels/FogPanel", () => ({ FogPanel: () => null }));
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const MAP_URL = "/uploads/map.png";
/** 50 px cells from the origin, so snapped corners are easy to read. */
const GRID = { ...DEFAULT_GRID, cellSize: 50, offsetX: 0, offsetY: 0 };
/** The canvas is 1:1 with the map: 800 × 600 on screen, at the screen origin. */
const VIEW = { width: 800, height: 600 };
const TOKEN = "gm-token";

function room(walls: Wall[] = [], withMap = true): RoomState {
  const state = emptyRoomState("r1");
  state.scene = { map: withMap ? { url: MAP_URL, width: VIEW.width, height: VIEW.height } : null, grid: GRID };
  state.walls = Object.fromEntries(walls.map((w) => [w.id, w]));
  return state;
}

type WallListener = (mapUrl: string, status: WallDetectionStatus) => void;

/** A connection that records commands and lets a test push a wallDetection notice. */
function fakeConnection() {
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
function pointer(type: "pointerDown" | "pointerUp", target: Element, at: Point) {
  const event = createEvent[type](target, {});
  Object.defineProperties(event, {
    clientX: { value: at.x }, clientY: { value: at.y }, button: { value: 0 }, pointerId: { value: 1 }, altKey: { value: false },
  });
  fireEvent(target, event);
}
const click = (canvas: Element, at: Point) => {
  pointer("pointerDown", canvas, at);
  pointer("pointerUp", canvas, at);
};
const canvas = () => screen.getByRole("application");
const tool = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
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
  // <dialog> is not implemented in jsdom.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
  vi.spyOn(api.walls, "preview").mockResolvedValue(new Blob(["png"]));
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("map editor walls (FR-GM-09, FR-GM-11)", () => {
  const mount = (state = room()) => {
    const fake = fakeConnection();
    render(<WallSetup connection={fake.connection} state={state} token={TOKEN} />);
    return fake;
  };

  it("greys out detection with the reason when the server can't detect, but still draws and erases", async () => {
    vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false, reason: "The vision service is not running." });
    mount();
    expect(await screen.findByText(/The vision service is not running\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(true);
    expect((tool("Detect like this") as HTMLButtonElement).disabled).toBe(true);
    expect((tool("Draw") as HTMLButtonElement).disabled).toBe(false);
    expect((tool("Erase") as HTMLButtonElement).disabled).toBe(false);
  });

  it("adds a wall per segment of a chain, snapped to grid corners, and Enter ends the chain", async () => {
    const { commands } = mount();
    const svg = canvas();
    click(svg, { x: 103, y: 98 });
    expect(commands).toEqual([]);
    click(svg, { x: 212, y: 101 });
    await waitFor(() => expect(commands).toHaveLength(1));
    click(svg, { x: 205, y: 203 });
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands).toEqual([
      { type: "wall.add", walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 } }] },
      { type: "wall.add", walls: [{ a: { x: 200, y: 100 }, b: { x: 200, y: 200 } }] },
    ]);

    fireEvent.keyDown(svg, { key: "Enter" });
    click(svg, { x: 403, y: 397 });
    await Promise.resolve();
    expect(commands).toHaveLength(2);
  });

  it("erases the wall near the click and nothing when the click is far away", async () => {
    const wall: Wall = { id: "w1", a: { x: 100, y: 100 }, b: { x: 300, y: 100 } };
    const { commands } = mount(room([wall]));
    fireEvent.click(tool("Erase"));
    const svg = canvas();

    click(svg, { x: 200, y: 150 });
    await Promise.resolve();
    expect(commands).toEqual([]);

    click(svg, { x: 200, y: 106 });
    await waitFor(() => expect(commands).toEqual([{ type: "wall.remove", wallIds: ["w1"] }]));
  });

  it("sends the clicked map point to Detect like this", async () => {
    const detect = vi.spyOn(api.walls, "detect").mockResolvedValue({ status: "queued" });
    mount();
    await waitFor(() => expect((tool("Detect like this") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(tool("Detect like this"));
    click(canvas(), { x: 321, y: 123 });
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, { x: 321, y: 123 }));
  });

  it("shows how many walls a finished detection found and applies them", async () => {
    const fake = mount();
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 7, width: 800, height: 600 });

    expect(await screen.findByText("7 walls found. Check them before applying.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply 7 walls" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "wall.applyDetected", mapUrl: MAP_URL }]));
  });

  it("offers Replace when walls already exist", async () => {
    const fake = mount(room([{ id: "w1", a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }]));
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 3, width: 800, height: 600 });
    expect(await screen.findByRole("button", { name: "Replace with 3 walls" })).toBeTruthy();
  });
});

describe("map editor in the GM panel (FR-GM-09)", () => {
  const mount = (state: RoomState) => {
    const fake = fakeConnection();
    render(
      <GmPanel
        connection={fake.connection} state={state} token={TOKEN}
        gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
        onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true}
        gridApplying={false} gridError={null} onReviewDeparture={() => {}}
      />,
    );
  };

  it("opens the full-screen editor from Edit map and reaches the Walls step", async () => {
    mount(room());
    expect(screen.getByText(/800 × 600 px · 0 walls/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1 · Map", "2 · Grid", "3 · Walls"]);
    expect(within(editor).getByRole("tab", { name: "2 · Grid" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(editor).getByRole("tab", { name: "3 · Walls" }));
    expect(within(editor).getByRole("complementary", { name: "Wall tools" })).toBeTruthy();
    expect(within(editor).getByRole("application")).toBeTruthy();
    await waitFor(() => expect(api.walls.availability).toHaveBeenCalled());
  });

  it("tells the GM to apply a map first when the room has none", () => {
    mount(room([], false));
    expect(screen.getByText("No map yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getByRole("tab", { name: "1 · Map" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(editor).getByRole("tab", { name: "3 · Walls" }));
    expect(within(editor).getByText(/Apply a map in the Map step first/)).toBeTruthy();
    expect(within(editor).queryByRole("application")).toBeNull();
  });
});
