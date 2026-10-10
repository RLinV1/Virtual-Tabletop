// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type UvttPreparation } from "@vtt/shared";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { WallProperties } from "../src/pages/mapEditor/WallProperties";
import { startUvttPrep, prepDirty } from "../src/pages/mapPrep";
import { fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";
vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));
const preparation: UvttPreparation = { id: "opaque", revision: 1, map: { url: "/uploads/import.png", width: 800, height: 600 },
  grid: { ...DEFAULT_GRID, cellSize: 50, offsetX: 12.5, offsetY: 4.5 },
  walls: [{ a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, portal: { position: { x: 40, y: 60 }, rotation: 1.3, closed: true, freestanding: true } }],
  diagnostics: [{ code: "unsupported_data", path: "lights", message: "Lights not imported", severity: "warning" }],
};
beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.uvtt, "prepare").mockResolvedValue(structuredClone(preparation));
  vi.spyOn(api.uvtt, "discard").mockResolvedValue();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const state = room(); const fake = fakeConnection();
  render(<GmPanel connection={fake.connection} state={state} token={TOKEN} gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return fake;
}
async function importFile() {
  fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
  fireEvent.click(screen.getByRole("tab", { name: /· Map$/ }));
  fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["json"], "map.dd2vtt")] } });
  await screen.findByText(/Draft map: only you see it/);
}

describe("private UVTT editor (FR-GM-06/07/09/12)", () => {
  it("preserves validated fractional offsets without legacy normalization and tracks geometry edits", () => {
    const prep = startUvttPrep(preparation); expect(prep.initial).toEqual(preparation.grid); expect(prepDirty(prep)).toBe(false);
    prep.walls = {}; expect(prepDirty(prep)).toBe(true);
  });
  it("keeps imports and portal edits local, validates a revised draft then applies only its opaque reference", async () => {
    vi.mocked(api.uvtt.prepare).mockResolvedValue({ ...structuredClone(preparation), walls: [...preparation.walls, { a: { x: 200, y: 100 }, b: { x: 700, y: 100 }, source: "line_of_sight" }] });
    const fake = mount(); await importFile();
    expect(fake.commands).toEqual([]);
    expect(screen.getByText("1 import warnings")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    expect((screen.getByLabelText("Portal position X") as HTMLInputElement).value).toBe("40");
    fireEvent.click(screen.getByLabelText("Closed (blocks movement)"));
    fireEvent.change(screen.getByLabelText("End B X"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(fake.commands).toEqual([]);
    expect(screen.getByRole("application").querySelector('line[x1="250"][x2="700"][y1="100"]')).toBeTruthy();
    const revise = vi.spyOn(api.uvtt, "revise").mockImplementation(async (_room, _token, _id, edit) => ({ ...preparation, ...edit, revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.importUVTT", importId: "opaque", revision: 2 }]));
    expect(revise.mock.calls[0]?.[3].walls[0]).toMatchObject({ b: { x: 250, y: 100 }, portal: { closed: false, freestanding: true, rotation: 1.3, position: { x: 40, y: 60 } } });
  });
  it("keeps a rejected unchanged draft for idempotent retry without revising it", async () => {
    const fake = mount();
    vi.mocked(fake.connection.command).mockResolvedValueOnce({ ok: false, code: "invalid", message: "Could not save. Draft kept." }).mockResolvedValue({ ok: true, seq: 3 });
    const revise = vi.spyOn(api.uvtt, "revise"); await importFile();
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not save. Draft kept.");
    fireEvent.click(screen.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.connection.command).toHaveBeenCalledTimes(2));
    expect(revise).not.toHaveBeenCalled();
  });
  it("requires discard confirmation for changed draft geometry, deletes preparation and returns focus", async () => {
    mount(); await importFile();
    fireEvent.click(screen.getByRole("tab", { name: /· Walls$/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Erase" }));
    // Selecting geometry and saving a change is keyboard accessible too.
    fireEvent.change(screen.getByLabelText("Selected geometry"), { target: { value: "draft:0" } });
    fireEvent.click(screen.getByLabelText("Closed (blocks movement)")); fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const discard = await screen.findByRole("button", { name: "Discard" }); fireEvent.click(discard);
    await waitFor(() => expect(api.uvtt.discard).toHaveBeenCalledWith("r1", TOKEN, "opaque"));
  });
  it("preserves absence of optional portal fields when saving unchanged metadata", async () => {
    const save = vi.fn();
    render(<WallProperties map={preparation.map} wall={{ id: "p", a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, portal: {} }} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    expect(save.mock.calls[0]?.[0].portal).toEqual({});
  });
});
