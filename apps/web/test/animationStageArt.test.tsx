// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StageScene } from "../src/board/previewStage";

vi.mock("../src/net/api", () => ({
  api: { library: { list: vi.fn(), animations: { create: vi.fn(), update: vi.fn() } } },
  whenSignedOut: vi.fn(),
}));
// The preview owns a WebGL canvas; this stand-in shows the scene it was handed instead.
vi.mock("../src/ui/AnimationPreviewStage", () => ({
  AnimationPreviewStage: ({ scene, children }: { scene: StageScene; children: import("react").ReactNode }) => (
    <div data-testid="preview" data-scene={JSON.stringify(scene)}>{children}</div>
  ),
}));
import { AnimationEditor } from "../src/pages/animationEditor/AnimationEditor";
import { clearAllStagePicks } from "../src/pages/animationEditor/stagePicks";

const scene = (): StageScene => JSON.parse(screen.getByTestId("preview").dataset.scene!) as StageScene;
const openEditor = () => render(<AnimationEditor animation={null} onSaved={() => {}} onCancel={() => {}} />);

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => {
  cleanup();
  clearAllStagePicks();
});

describe("animation preview on the GM's own map and tokens (FR-TAC-09, ADR 0038)", () => {
  it("opens from the preview's toolbar and says the animation saves without it", () => {
    openEditor();
    const button = screen.getByRole("button", { name: "Map & tokens" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Map & tokens" })).toBeTruthy();
    expect(screen.getByText(/the animation saves without it/)).toBeTruthy();
    // No step tab is current while the stage art is showing; choosing one returns to it.
    expect(screen.getAllByRole("tab").some((tab) => tab.getAttribute("aria-selected") === "true")).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Motion" }));
    expect(screen.getByRole("heading", { name: "Motion" })).toBeTruthy();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("puts a picked token on the stage without changing the animation, and back to the default", () => {
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Map & tokens" }));
    const slots = within(screen.getByRole("group", { name: "Part of the stage" }));
    fireEvent.click(slots.getByRole("button", { name: /^Target/ }));
    fireEvent.click(screen.getByRole("button", { name: "Goblin Guard" }));

    expect(scene().target).toMatch(/goblin-guard/);
    expect(scene().attacker).toBeNull();
    expect(slots.getByRole("button", { name: /^Target/ }).textContent).toContain("Goblin Guard");
    expect(screen.getByRole("button", { name: "Goblin Guard" }).getAttribute("aria-pressed")).toBe("true");
    // Preview only: the animation itself has nothing new to save.
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use default" }));
    expect(scene().target).toBeNull();
  });

  it("keeps the stage for the next animation opened, until it is reset", () => {
    const first = openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Map & tokens" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Part of the stage" })).getByRole("button", { name: /^Attacker/ }));
    fireEvent.click(screen.getByRole("button", { name: "Human Mage" }));
    first.unmount();

    openEditor();
    expect(scene().attacker).toMatch(/human-mage/);
    fireEvent.click(screen.getByRole("button", { name: "Map & tokens" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset stage" }));
    expect(scene()).toEqual({ map: null, attacker: null, target: null });
  });
});
