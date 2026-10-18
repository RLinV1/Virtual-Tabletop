// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAnimation } from "@vtt/shared";
import { ANIMATION_SHAPES } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET, SHAPE_DEFAULTS } from "../src/board/effectPresets";

vi.mock("../src/net/api", () => ({
  api: { library: { animations: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } } },
}));
// The preview owns a WebGL canvas; these tests never need it.
vi.mock("../src/ui/AnimationPreviewStage", () => ({ AnimationPreviewStage: () => null }));

import { api } from "../src/net/api";
import { AnimationsTab, copyName, filterAnimations } from "../src/pages/LibraryAnimations";

const entry = (id: string, name: string, def = ATTACK_STYLE_PRESETS.melee): LibraryAnimation => ({ id, name, def, createdAt: "", updatedAt: "" });
const list = vi.mocked(api.library.animations.list);
const create = vi.mocked(api.library.animations.create);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  list.mockReset();
  create.mockReset();
});
afterEach(cleanup);

describe("library Animations tab (FR-TAC-09, ADR 0038)", () => {
  it("filters by name, ignoring case", () => {
    const all = [entry("1", "Fire Slash"), entry("2", "Ice Bolt")];
    expect(filterAnimations(all, "slash").map((a) => a.id)).toEqual(["1"]);
    expect(filterAnimations(all, "  ")).toHaveLength(2);
  });

  it("names a copy within the 60-character limit", () => {
    expect(copyName("Fire")).toBe("Fire copy");
    expect(copyName("x".repeat(60))).toHaveLength(60);
  });

  it("lists the GM's animations and narrows them with the search", async () => {
    list.mockResolvedValue([entry("1", "Fire Slash"), entry("2", "Ice Bolt", ATTACK_STYLE_PRESETS.magic)]);
    const { rerender } = render(<AnimationsTab query="" onError={() => {}} />);
    expect(await screen.findByText("Fire Slash")).toBeTruthy();
    expect(screen.getByText("Ice Bolt")).toBeTruthy();
    rerender(<AnimationsTab query="ice" onError={() => {}} />);
    expect(screen.queryByText("Fire Slash")).toBeNull();
    expect(screen.getByText("Ice Bolt")).toBeTruthy();
  });

  it("duplicates a built-in into the library with Start from built-in", async () => {
    list.mockResolvedValue([]);
    create.mockResolvedValue(entry("9", "Nuke", NUKE_PRESET));
    render(<AnimationsTab query="" onError={() => {}} />);
    await screen.findByText(/haven't made any animations/);
    fireEvent.change(screen.getByRole("combobox", { name: "Start from built-in" }), { target: { value: "builtin-nuke" } });
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "Nuke", def: NUKE_PRESET }));
  });
});


describe("animation editor shape defaults (library-animations, ADR 0038)", () => {
  async function openEditor() {
    list.mockResolvedValue([]);
    render(<AnimationsTab query="" onError={() => {}} />);
    await screen.findByText(/haven't made any animations/);
    fireEvent.click(screen.getByRole("button", { name: "New animation" }));
    return screen.findByRole("form", { name: "New animation" });
  }
  const slider = (name: string) => screen.getByText(name, { selector: ".animation-slider-label" }).closest("label")!.querySelector("input") as HTMLInputElement;
  const shapeSelect = () => screen.getByRole("combobox", { name: /^Shape/ }) as HTMLSelectElement;

  it("starts a new animation from the slash default", async () => {
    await openEditor();
    expect(shapeSelect().value).toBe("slash");
    expect(Number(slider("Count").value)).toBe(SHAPE_DEFAULTS.slash.count);
    expect(Number(slider("Duration").value)).toBe(SHAPE_DEFAULTS.slash.duration);
  });

  it("loads the default of a newly chosen shape into every field", async () => {
    await openEditor();
    fireEvent.change(shapeSelect(), { target: { value: "tornado" } });
    const d = SHAPE_DEFAULTS.tornado;
    expect(shapeSelect().value).toBe("tornado");
    expect(Number(slider("Duration").value)).toBe(d.duration);
    expect(Number(slider("Size").value)).toBe(d.size);
    expect(Number(slider("Particles").value)).toBe(d.particles);
    expect(Number(slider("Count").value)).toBe(d.count);
    expect(Number(slider("Spread").value)).toBe(d.spread);
    expect(Number(slider("Arc").value)).toBe(d.arc);
    expect(Number(slider("Trail").value)).toBe(d.trail);
    expect(Number(slider("Spin").value)).toBe(d.spin);
    expect(Number(slider("Gravity").value)).toBe(d.gravity);
    expect(Number(slider("Rings").value)).toBe(d.rings);
    expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe(d.primary);
    expect((screen.getByLabelText("Accent colour") as HTMLInputElement).value).toBe(d.accent);
    expect((screen.getByLabelText("Use accent") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Particle look") as HTMLSelectElement).value).toBe(d.particleShape);
  });

  it("restores the shape default with Reset to shape default", async () => {
    await openEditor();
    fireEvent.change(shapeSelect(), { target: { value: "volley" } });
    fireEvent.change(slider("Count"), { target: { value: "2" } });
    fireEvent.change(slider("Gravity"), { target: { value: "-0.5" } });
    fireEvent.click(screen.getByLabelText("Use accent"));
    fireEvent.change(screen.getByLabelText("Particle look"), { target: { value: "ring" } });
    expect(Number(slider("Count").value)).toBe(2);
    expect((screen.getByLabelText("Use accent") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reset to shape default" }));
    const d = SHAPE_DEFAULTS.volley;
    expect(shapeSelect().value).toBe("volley");
    expect(Number(slider("Count").value)).toBe(d.count);
    expect(Number(slider("Gravity").value)).toBe(d.gravity);
    expect((screen.getByLabelText("Use accent") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Particle look") as HTMLSelectElement).value).toBe(d.particleShape);
  });

  it("saves the edited values with the later fields", async () => {
    create.mockResolvedValue(entry("5", "New animation"));
    await openEditor();
    fireEvent.change(shapeSelect(), { target: { value: "chain" } });
    fireEvent.change(slider("Count"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0].def).toEqual({ ...SHAPE_DEFAULTS.chain, count: 6 });
  });

  it("lists a built-in for every shape in Start from built-in", async () => {
    list.mockResolvedValue([]);
    render(<AnimationsTab query="" onError={() => {}} />);
    await screen.findByText(/haven't made any animations/);
    const select = screen.getByRole("combobox", { name: "Start from built-in" }) as HTMLSelectElement;
    expect(select.options.length - 1).toBe(ANIMATION_SHAPES.length);
  });
});
