// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAnimation } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET } from "../src/board/effectPresets";

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
