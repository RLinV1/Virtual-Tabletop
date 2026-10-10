// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toGridDraft } from "../src/pages/gridDraft";
import { SAMPLE_TOLERANCE_DEFAULT, type RoomState, type Wall } from "@vtt/shared";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { WallSetup } from "../src/pages/mapEditor/WallSetup";
import { MAP_URL, TOKEN, click, fakeConnection, pointer, room, stubMapEditorEnvironment } from "./mapEditorHarness";

// The panels below the map section have nothing to do with the editor.
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const canvas = () => screen.getByRole("application");
const tool = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
  vi.spyOn(api.walls, "preview").mockResolvedValue(new Blob(["png"]));
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

  it("zooms about the midpoint of a two-finger pinch in any mode, and a pinch adds no wall", async () => {
    const { commands } = mount();
    const svg = canvas();
    expect(svg.getAttribute("viewBox")).toBe("0 0 800 600");
    // Two fingers 100 px apart about (400, 300) spread to 200 px: zoom doubles about that point.
    pointer("pointerDown", svg, { x: 350, y: 300 }, { id: 1 });
    pointer("pointerDown", svg, { x: 450, y: 300 }, { id: 2 });
    pointer("pointerMove", svg, { x: 300, y: 300 }, { id: 1 });
    pointer("pointerMove", svg, { x: 500, y: 300 }, { id: 2 });
    expect(svg.getAttribute("viewBox")).toBe("200 150 400 300");
    pointer("pointerUp", svg, { x: 300, y: 300 }, { id: 1 });
    pointer("pointerUp", svg, { x: 500, y: 300 }, { id: 2 });
    expect(commands).toEqual([]);
  });

  it("pans on a two-finger drag in Draw mode, then taps still draw", async () => {
    const { commands } = mount();
    const svg = canvas();
    pointer("pointerDown", svg, { x: 350, y: 300 }, { id: 1 });
    pointer("pointerDown", svg, { x: 450, y: 300 }, { id: 2 });
    // Both fingers drag 80 px right: the map moves with them, so the view moves left.
    pointer("pointerMove", svg, { x: 430, y: 300 }, { id: 1 });
    pointer("pointerMove", svg, { x: 530, y: 300 }, { id: 2 });
    expect(svg.getAttribute("viewBox")).toBe("-80 0 800 600");
    pointer("pointerUp", svg, { x: 430, y: 300 }, { id: 1 });
    pointer("pointerUp", svg, { x: 530, y: 300 }, { id: 2 });
    expect(commands).toEqual([]);
    click(svg, { x: 100, y: 100 });
    click(svg, { x: 200, y: 100 });
    await waitFor(() => expect(commands).toHaveLength(1));
  });

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
    const { commands } = mount(room({ walls: [wall] }));
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
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, { x: 321, y: 123 }, SAMPLE_TOLERANCE_DEFAULT));
  });

  it("sends the colour range chosen on the slider with the click", async () => {
    const detect = vi.spyOn(api.walls, "detect").mockResolvedValue({ status: "queued" });
    mount();
    await waitFor(() => expect((tool("Detect like this") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(tool("Detect like this"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "18" } });
    click(canvas(), { x: 321, y: 123 });
    await waitFor(() => expect(detect).toHaveBeenCalledWith("r1", TOKEN, { x: 321, y: 123 }, 18));
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
    const fake = mount(room({ walls: [{ id: "w1", a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }] }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Detect walls" }) as HTMLButtonElement).disabled).toBe(false));
    fake.notify({ status: "done", wallCount: 3, width: 800, height: 600 });
    expect(await screen.findByRole("button", { name: "Replace with 3 walls" })).toBeTruthy();
  });
});

describe("map editor in the GM panel (FR-GM-09, FR-GM-17)", () => {
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

  it("opens the full-screen editor from Edit map and reaches the Walls and Fog steps", async () => {
    mount(room());
    expect(screen.getByText(/800 × 600 px · 0 walls/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1 · Map", "2 · Grid", "3 · Walls", "4 · Fog"]);
    expect(within(editor).getByRole("tab", { name: "2 · Grid" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(editor).getByRole("tab", { name: "3 · Walls" }));
    expect(within(editor).getByRole("complementary", { name: "Wall tools" })).toBeTruthy();
    expect(within(editor).getByRole("application")).toBeTruthy();
    await waitFor(() => expect(api.walls.availability).toHaveBeenCalled());

    fireEvent.click(within(editor).getByRole("tab", { name: "4 · Fog" }));
    expect(within(editor).getByRole("complementary", { name: "Fog tools" })).toBeTruthy();
    expect(within(editor).getByRole("application")).toBeTruthy();
    expect(within(editor).getByRole("button", { name: "Fog whole map" })).toBeTruthy();
  });

  it("shows the title and the steps in one header row", () => {
    mount(room());
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    const head = editor.querySelector(".modal-head")!;
    expect(within(head as HTMLElement).getByRole("heading", { name: "Edit map" })).toBeTruthy();
    expect(within(head as HTMLElement).getAllByRole("tab")).toHaveLength(4);
    expect(within(head as HTMLElement).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("tells the GM to apply a map first when the room has none", () => {
    mount(room({ withMap: false }));
    expect(screen.getByText("No map yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getByRole("tab", { name: "1 · Map" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(editor).getByRole("tab", { name: "3 · Walls" }));
    expect(within(editor).getByText(/Apply a map in the Map step first/)).toBeTruthy();
    expect(within(editor).queryByRole("application")).toBeNull();

    fireEvent.click(within(editor).getByRole("tab", { name: "4 · Fog" }));
    expect(within(editor).getByText(/Apply a map in the Map step first/)).toBeTruthy();
    expect(within(editor).queryByRole("application")).toBeNull();
  });
});
