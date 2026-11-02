// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, EMPTY_STATS, type LibraryAsset, type RoomState } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { GRID, fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); accountStore.setState({ status: "loading" }); });

function mount(state: RoomState = room()) {
  const fake = fakeConnection();
  render(<GmPanel connection={fake.connection} state={state} token={TOKEN} gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return fake;
}
const editor = () => screen.getByRole("dialog", { name: "Edit map" });
const withPlayer = (state: RoomState) => {
  state.participants.p1 = { id: "p1", role: "player", displayName: "Pia" };
  return state;
};
const token = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
const openSight = () => { fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(within(editor()).getByRole("tab", { name: "5 · Sight" })); };
const lineOfSightBox = () => within(editor()).getByRole("button", { name: /^Line of sight (on|off)$/ });
const limited = () => within(editor()).getByRole("radio", { name: /^Limited$/ });
const unlimited = () => within(editor()).getByRole("radio", { name: /^Unlimited$/ });

describe("map editor Sight step (FR-GM-19)", () => {
  it("has a tab after Fog and asks for a map when there is none", async () => {
    vi.spyOn(api.uvtt, "prepare").mockResolvedValue({ id: "opaque", revision: 1, map: { url: "/uploads/import.png", width: 800, height: 600 }, grid: GRID, walls: [], diagnostics: [] });
    vi.spyOn(api.uvtt, "discard").mockResolvedValue();
    mount(room({ withMap: false }));
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["json"], "map.dd2vtt")] } });
    await screen.findByText(/Unsaved changes: only you see them/);
    const tabs = within(editor()).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["1 · Map", "2 · Grid", "3 · Walls", "4 · Fog", "5 · Sight"]);
    fireEvent.click(within(editor()).getByRole("tab", { name: "5 · Sight" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Apply this map?" })).getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Apply a map before setting up sight.")).toBeTruthy();
  });

  it("sends line of sight and the range only on Save changes", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(limited());
    fireEvent.change(within(editor()).getByLabelText("Sight range in ft"), { target: { value: "60" } });
    expect(within(editor()).getByText("ft")).toBeTruthy();
    expect(fake.commands).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([
      { type: "scene.setLineOfSight", expectedSceneId: "initial", enabled: true },
      { type: "scene.setSightRange", expectedSceneId: "initial", range: 60 },
    ]));
  });

  it("previews sight from a test token the GM moves, without sending anything", () => {
    const state = room({ walls: [{ id: "w", a: { x: 250, y: 0 }, b: { x: 250, y: 600 } }] });
    state.tokens = { hero: { ...token, position: { x: 100, y: 300 } } };
    const fake = mount(state); openSight();
    expect((within(editor()).getByLabelText("Preview as") as HTMLSelectElement).value).toBe("sight-test-token");
    expect(within(editor()).getByText("Test token sees 0 of 1 token.")).toBeTruthy();
    const marker = within(editor()).getByRole("button", { name: /^Test token\./ });
    for (let i = 0; i < 4; i++) fireEvent.keyDown(marker, { key: "ArrowLeft" });
    expect(within(editor()).getByText("Test token sees 1 of 1 token.")).toBeTruthy();
    expect(fake.commands).toEqual([]);
  });

  it("the slider moves the range in whole squares", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(limited());
    fireEvent.change(within(editor()).getByLabelText("Sight range in squares"), { target: { value: "6" } });
    expect((within(editor()).getByLabelText("Sight range in ft") as HTMLInputElement).value).toBe("30");
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.setSightRange", expectedSceneId: "initial", range: 30 }]));
  });

  it("Discard sends nothing", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/)).toBeNull());
    expect(fake.commands).toEqual([]);
  });

  it("Unlimited sends range null", async () => {
    const state = withPlayer(room()); state.scene.sightRange = 40;
    const fake = mount(state); openSight();
    fireEvent.click(unlimited());
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.setSightRange", expectedSceneId: "initial", range: null }]));
  });

  it("asks before leaving Sight with unsaved changes", () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(within(editor()).getByRole("tab", { name: "3 · Walls" }));
    expect(screen.getByRole("dialog", { name: "Save changes?" })).toBeTruthy();
    expect(fake.commands).toEqual([]);
  });

  it("the library map editor has no Sight step", () => {
    vi.spyOn(api.detection, "library").mockResolvedValue(null);
    vi.spyOn(api.library, "board").mockResolvedValue({ walls: [], fog: [] });
    const asset: LibraryAsset = { id: "map1", kind: "map", name: "Crypt", url: "/crypt.png", width: 700, height: 700, grid: DEFAULT_GRID, createdAt: "2026-10-18T00:00:00Z" };
    render(<LibraryMapEditor asset={asset} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Sight/ })).toBeNull();
  });
});

describe("token dialog hand-off from the leave-step prompt (FR-GM-04)", () => {
  const replacement: LibraryAsset = { id: "new-map", kind: "map", name: "New map", url: "/uploads/new.png", width: 800, height: 600, grid: DEFAULT_GRID, createdAt: "2026-10-18T00:00:00.000Z" };
  const setup = () => {
    accountStore.setState({ status: "signedIn", account: { id: "user", email: "gm@example.com", displayName: "GM" } });
    vi.spyOn(api.library, "list").mockResolvedValue([replacement]);
    vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    const state = room(); state.tokens.hero = token;
    return mount(state);
  };
  const prepared = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(replacement.name));
    fireEvent.click(within(editor()).getByRole("tab", { name: "3 · Walls" }));
    return within(await screen.findByRole("dialog", { name: "Apply this map?" }));
  };

  it("Apply map opens the tokens dialog, then sends setMap with the policy and moves on", async () => {
    const fake = setup();
    const prompt = await prepared();
    fireEvent.click(prompt.getByRole("button", { name: "Apply map" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tokens already on the table" }));
    expect(fake.commands).toEqual([]);
    fireEvent.click(dialog.getByRole("radio", { name: /^Keep positions/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", tokenPolicy: "keep" })]));
    await waitFor(() => expect(within(editor()).getByRole("tab", { name: "3 · Walls" }).getAttribute("aria-selected")).toBe("true"));
  });

  it("Cancel in the tokens dialog sends nothing", async () => {
    const fake = setup();
    const prompt = await prepared();
    fireEvent.click(prompt.getByRole("button", { name: "Apply map" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tokens already on the table" }));
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(fake.commands).toEqual([]);
  });
});
