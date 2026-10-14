// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCreature } from "@vtt/shared";
import { api } from "../src/net/api";
import type { CreaturePrefill } from "../src/pages/creatureDraft";
import { CreatureForm } from "../src/pages/LibraryCreatures";

const advanced = () => screen.getByText("Advanced settings").closest("details") as HTMLDetailsElement;
const startingConditions = () => screen.getByRole("group", { name: "Starting conditions" });
const startingHp = () => screen.getByLabelText(/^Starting HP/) as HTMLInputElement;
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const mount = (prefill?: CreaturePrefill) =>
  render(<CreatureForm creature={null} prefill={prefill} onSaved={() => {}} onCancel={() => {}} />);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("creature form advanced settings (library-creatures)", () => {
  it("starts a new creature with Size, Max HP and AC shown, Advanced settings closed, and no extra hints", () => {
    mount();
    expect(screen.getByLabelText("Size (cells)")).toBeTruthy();
    expect(screen.getByLabelText("Max HP")).toBeTruthy();
    expect(screen.getByLabelText("AC")).toBeTruthy();
    expect(advanced().open).toBe(false);
    expect(advanced().contains(startingHp())).toBe(true);
    expect(advanced().contains(screen.getByLabelText("Colour without art"))).toBe(true);
    // The conditions open and close with Advanced settings: no section of their own.
    expect(advanced().contains(startingConditions())).toBe(true);
    expect(advanced().querySelector("details")).toBeNull();
    expect(document.body.textContent).not.toContain("colour disc");
    expect(document.body.textContent).not.toContain("copied to each placed token");
  });

  it("opens on values that are already set, and stays open when one is cleared", () => {
    mount({
      name: "Ogre", size: 2, hp: 30, maxHp: 59, ac: 11, color: "#6d4c41",
      conditions: ["prone"], attacks: [], imageAssetId: null, imageUrl: null,
    });
    expect(advanced().open).toBe(true);
    expect(startingHp().value).toBe("30");
    expect(advanced().contains(startingConditions())).toBe(true);
    expect((within(startingConditions()).getByRole("checkbox", { name: /Prone/ }) as HTMLInputElement).checked).toBe(true);
    expect(advanced().querySelector("details")).toBeNull();

    fireEvent.change(startingHp(), { target: { value: "" } });
    expect(advanced().open).toBe(true);
  });

  it("opens for the Starting HP error, and saves what was entered under Advanced settings", async () => {
    const create = vi.spyOn(api.library.creatures, "create").mockImplementation(
      async (req) => ({ id: "c1", ...req, imageUrl: null }) as LibraryCreature,
    );
    mount();
    type(/^Name on the board/, "Ogre");
    type("Max HP", "10");
    expect(advanced().open).toBe(false);
    fireEvent.change(startingHp(), { target: { value: "20" } });
    expect(advanced().open).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Starting HP cannot exceed Max HP.");

    fireEvent.change(startingHp(), { target: { value: "8" } });
    fireEvent.input(screen.getByLabelText("Colour without art"), { target: { value: "#112233" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Prone/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create creature" }));

    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[0]).toMatchObject({ name: "Ogre", hp: 8, maxHp: 10, color: "#112233", conditions: ["prone"] });
  });
});
