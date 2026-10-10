// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FOG_POINTS, type FogRegion } from "@vtt/shared";
import { FogSetup } from "../src/pages/mapEditor/FogSetup";
import { click, drag, fakeConnection, pointer, room, stubMapEditorEnvironment } from "./mapEditorHarness";

const canvas = () => screen.getByRole("application");
const tool = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => stubMapEditorEnvironment());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("map editor fog (FR-GM-17)", () => {
  const mount = (state = room()) => {
    const fake = fakeConnection();
    render(<FogSetup connection={fake.connection} state={state} />);
    return fake;
  };

  it("fogs a dragged rectangle with one fog.add, clamped to the map", async () => {
    const { commands } = mount();
    drag(canvas(), { x: 100, y: 120 }, { x: 900, y: 300 });
    await waitFor(() => expect(commands).toEqual([
      { type: "fog.add", region: { shape: "rect", from: { x: 100, y: 120 }, to: { x: 800, y: 300 } } },
    ]));
  });

  it("a second finger cancels a rectangle press, so a pinch fogs nothing", async () => {
    const { commands } = mount();
    const svg = canvas();
    pointer("pointerDown", svg, { x: 100, y: 120 }, { id: 1 });
    pointer("pointerDown", svg, { x: 300, y: 120 }, { id: 2 });
    pointer("pointerMove", svg, { x: 50, y: 120 }, { id: 1 });
    pointer("pointerMove", svg, { x: 350, y: 120 }, { id: 2 });
    pointer("pointerUp", svg, { x: 50, y: 120 }, { id: 1 });
    pointer("pointerUp", svg, { x: 350, y: 120 }, { id: 2 });
    await Promise.resolve();
    expect(commands).toEqual([]);
  });

  it("sends nothing for a rectangle press that does not move", async () => {
    const { commands } = mount();
    click(canvas(), { x: 100, y: 120 });
    await Promise.resolve();
    expect(commands).toEqual([]);
  });

  it("closes a polygon on Enter and on its first corner", async () => {
    const { commands } = mount();
    fireEvent.click(tool("Polygon"));
    const svg = canvas();
    click(svg, { x: 100, y: 100 });
    click(svg, { x: 300, y: 100 });
    click(svg, { x: 200, y: 250 });
    expect(commands).toEqual([]);
    fireEvent.keyDown(svg, { key: "Enter" });
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      type: "fog.add",
      region: { shape: "polygon", points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 250 }] },
    });

    click(svg, { x: 400, y: 400 });
    click(svg, { x: 600, y: 400 });
    click(svg, { x: 500, y: 500 });
    click(svg, { x: 404, y: 402 });
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual({
      type: "fog.add",
      region: { shape: "polygon", points: [{ x: 400, y: 400 }, { x: 600, y: 400 }, { x: 500, y: 500 }] },
    });
  });

  it("drops a half-drawn polygon on Escape, on right-click and on a tool change", async () => {
    const { commands } = mount();
    fireEvent.click(tool("Polygon"));
    const svg = canvas();
    const threeCorners = () => {
      click(svg, { x: 100, y: 100 });
      click(svg, { x: 300, y: 100 });
      click(svg, { x: 200, y: 250 });
    };

    threeCorners();
    fireEvent.keyDown(svg, { key: "Escape" });
    fireEvent.keyDown(svg, { key: "Enter" });
    threeCorners();
    pointer("pointerDown", svg, { x: 10, y: 10 }, { button: 2 });
    fireEvent.keyDown(svg, { key: "Enter" });
    threeCorners();
    fireEvent.click(tool("Rectangle"));
    fireEvent.click(tool("Polygon"));
    fireEvent.keyDown(svg, { key: "Enter" });
    await Promise.resolve();
    expect(commands).toEqual([]);
  });

  it("refuses a polygon corner past the limit and says why", async () => {
    mount();
    fireEvent.click(tool("Polygon"));
    const svg = canvas();
    for (let i = 0; i < MAX_FOG_POINTS; i++) click(svg, { x: 20 + (i % 8) * 90, y: 20 + Math.floor(i / 8) * 60 });
    click(svg, { x: 700, y: 560 });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(`${MAX_FOG_POINTS} corners`);
  });

  it("reveals the topmost region under a click and nothing on bare map", async () => {
    const square = (id: string, x: number, y: number, size: number): FogRegion => ({
      id, shape: "rect", points: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }],
    });
    const { commands } = mount(room({ fog: [square("under", 100, 100, 300), square("over", 200, 200, 100)] }));
    fireEvent.click(tool("Reveal"));
    const svg = canvas();

    click(svg, { x: 600, y: 500 });
    await Promise.resolve();
    expect(commands).toEqual([]);

    click(svg, { x: 250, y: 250 });
    await waitFor(() => expect(commands).toEqual([{ type: "fog.remove", regionId: "over" }]));
    click(svg, { x: 120, y: 120 });
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual({ type: "fog.remove", regionId: "under" });
  });

  it("fogs the whole map from the controls beside the canvas", async () => {
    const { commands } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Fog whole map" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({ type: "fog.add", region: { shape: "rect" } });
  });

  it("asks for a map first when the room has none", () => {
    mount(room({ withMap: false }));
    expect(screen.getByText(/Apply a map in the Map step first/)).toBeTruthy();
    expect(screen.queryByRole("application")).toBeNull();
  });
});
