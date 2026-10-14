// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, presetOf } from "@vtt/shared";
import { AddTokenButton } from "../src/panels/AddToken";

// Free Mode is the only preset and has conditions on; a test turns them off through presetOf.
vi.mock("@vtt/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vtt/shared")>();
  return { ...actual, presetOf: vi.fn(actual.presetOf) };
});

const advanced = () => screen.getByText("Advanced settings").closest("details") as HTMLDetailsElement;

function open() {
  render(<AddTokenButton state={emptyRoomState("r1")} token="t" onPlace={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "New Token" }));
}

beforeEach(() => {
  // jsdom has no modal dialogs; open and close are all the form needs.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => {
  cleanup();
  vi.mocked(presetOf).mockRestore();
});

describe("Add Token advanced settings (KAN-63)", () => {
  it("shows the starting conditions directly in Advanced settings, opening and closing with it", () => {
    open();
    expect(advanced().open).toBe(false);
    const conditions = screen.getByRole("group", { name: "Starting conditions" });
    expect(advanced().contains(conditions)).toBe(true);
    expect(advanced().querySelector("details")).toBeNull();
    expect(conditions.querySelector("input[type=checkbox]")).not.toBeNull();
  });

  it("leaves the conditions out when the room's game turns them off", () => {
    const actual = presetOf(emptyRoomState("r1"));
    vi.mocked(presetOf).mockReturnValue({ ...actual, features: { ...actual.features, conditions: false } });
    open();
    expect(screen.queryByRole("group", { name: "Starting conditions" })).toBeNull();
    expect(advanced().contains(screen.getByLabelText("Colour without art"))).toBe(true);
  });
});
