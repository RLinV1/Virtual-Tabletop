// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAnimation } from "@vtt/shared";
import { ANIMATION_SHAPES } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET, SHAPE_DEFAULTS } from "../src/board/effectPresets";

// jsdom has no scrollIntoView, which the Picker uses to follow its highlighted option.
Element.prototype.scrollIntoView = vi.fn();

vi.mock("../src/net/api", () => ({
  api: { library: { animations: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } } },
  // The editor's stage picker reads the account store, which registers for sign-out on load.
  whenSignedOut: vi.fn(),
}));
// The preview owns a WebGL canvas; these tests never need it.
vi.mock("../src/ui/AnimationPreviewStage", () => ({ AnimationPreviewStage: ({ def, children }: { def: { shape: string }; children: import("react").ReactNode }) => <div data-testid="preview" data-shape={def.shape}>{children}</div> }));

vi.mock("../src/board/animationThumbnail", () => ({
  animationThumbnail: vi.fn(async () => "data:image/png;base64,preview"),
  cachedAnimationThumbnail: () => undefined,
  thumbnailKey: (def: unknown) => JSON.stringify(def),
  retainThumbnailRenderer: () => () => {},
}));
import { animationThumbnail } from "../src/board/animationThumbnail";
import { api } from "../src/net/api";
import { AnimationsTab, copyName, filterAnimations } from "../src/pages/LibraryAnimations";

const entry = (id: string, name: string, def = ATTACK_STYLE_PRESETS.melee): LibraryAnimation => ({ id, name, def, createdAt: "", updatedAt: "" });
const list = vi.mocked(api.library.animations.list);
const create = vi.mocked(api.library.animations.create);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  vi.mocked(animationThumbnail).mockClear();
  list.mockReset();
  create.mockReset();
  vi.mocked(api.library.animations.update).mockReset();
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

  it("shows a static preview image for every animation card", async () => {
    list.mockResolvedValue([entry("1", "Fire Slash"), entry("2", "Ice Bolt", ATTACK_STYLE_PRESETS.magic)]);
    render(<AnimationsTab query="" onError={() => {}} />);
    expect(await screen.findByAltText("Preview of Fire Slash")).toBeTruthy();
    expect(await screen.findByAltText("Preview of Ice Bolt")).toBeTruthy();
    expect(animationThumbnail).toHaveBeenCalledWith(ATTACK_STYLE_PRESETS.melee);
    expect(animationThumbnail).toHaveBeenCalledWith(ATTACK_STYLE_PRESETS.magic);
  });

  it("duplicates a built-in into the library with Start from built-in", async () => {
    list.mockResolvedValue([]);
    create.mockResolvedValue(entry("9", "Nuke", NUKE_PRESET));
    render(<AnimationsTab query="" onError={() => {}} />);
    await screen.findByText(/haven't made any animations/);
    fireEvent.click(screen.getByRole("combobox", { name: "Start from built-in" }));
    fireEvent.click(screen.getByRole("option", { name: /^Nuke/ }));
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
  const appearance = () => fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
  const slider = (name: string) => {
    fireEvent.click(screen.getByRole("tab", { name: ["Duration", "Size", "Particles", "Glow", "Shake", "Flash"].includes(name) ? "Timing & power" : "Motion" }));
    return screen.getByText(name, { selector: ".animation-slider-label" }).closest("label")!.querySelector("input") as HTMLInputElement;
  };
  const shapeSelect = () => {
    appearance();
    return screen.getByRole("combobox", { name: /^Shape/ }) as HTMLSelectElement;
  };

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
    appearance();
    expect((screen.getByLabelText("Primary colour") as HTMLInputElement).value).toBe(d.primary);
    expect((screen.getByLabelText("Accent colour") as HTMLInputElement).value).toBe(d.accent);
    appearance();
    expect((screen.getByLabelText("Use accent") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Particle look") as HTMLSelectElement).value).toBe(d.particleShape);
  });

  it("restores the shape default with Reset to shape default", async () => {
    await openEditor();
    fireEvent.change(shapeSelect(), { target: { value: "volley" } });
    fireEvent.change(slider("Count"), { target: { value: "2" } });
    fireEvent.change(slider("Gravity"), { target: { value: "-0.5" } });
    appearance();
    fireEvent.click(screen.getByLabelText("Use accent"));
    fireEvent.change(screen.getByLabelText("Particle look"), { target: { value: "ring" } });
    expect(Number(slider("Count").value)).toBe(2);
    appearance();
    expect((screen.getByLabelText("Use accent") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reset to shape default" }));
    const d = SHAPE_DEFAULTS.volley;
    expect(shapeSelect().value).toBe("volley");
    expect(Number(slider("Count").value)).toBe(d.count);
    expect(Number(slider("Gravity").value)).toBe(d.gravity);
    appearance();
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
    fireEvent.click(screen.getByRole("combobox", { name: "Start from built-in" }));
    expect(screen.getAllByRole("option")).toHaveLength(ANIMATION_SHAPES.length);
  });
});


describe("dedicated animation editor (library-animations, ADR 0038)", () => {
  async function open() {
    list.mockResolvedValue([]);
    render(<AnimationsTab query="" onError={() => {}} />);
    await screen.findByText(/haven't made any animations/);
    fireEvent.click(screen.getByRole("button", { name: "New animation" }));
  }

  it("uses the full-screen shell and keeps the preview mounted across sections", async () => {
    await open();
    expect(screen.getByRole("dialog", { name: "New animation" }).classList.contains("map-editor")).toBe(true);
    const preview = screen.getByTestId("preview");
    fireEvent.change(screen.getByRole("combobox", { name: "Shape" }), { target: { value: "bolt" } });
    fireEvent.click(screen.getByRole("tab", { name: "Timing & power" }));
    expect(screen.getByTestId("preview")).toBe(preview);
    expect(preview.getAttribute("data-shape")).toBe("bolt");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("protects unsaved edits until Discard changes is chosen", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Burning slash" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Discard animation changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Burning slash");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("dialog", { name: "New animation" })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the draft and reports a failed save", async () => {
    await open();
    create.mockRejectedValue(new Error("Connection interrupted"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fire burst" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Connection interrupted");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Fire burst");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
