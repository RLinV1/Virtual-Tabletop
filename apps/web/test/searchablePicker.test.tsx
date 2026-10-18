// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchablePicker } from "../src/ui/SearchablePicker";
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
it("searches animations in a separate dialog and selects the filtered result", () => {
  const choose = vi.fn();
  render(<SearchablePicker label="Animation" value="auto" onChange={choose} options={[
    { key: "auto", label: "Automatic" }, { key: "fire", label: "Fireball", detail: "preset" }, { key: "ice", label: "Ice bolt" },
  ]} />);
  fireEvent.click(screen.getByRole("button", { name: "Animation" }));
  expect(screen.getByRole("dialog", { name: "Choose attack animation" })).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search animations" }), { target: { value: "FIRE" } });
  expect(screen.queryByRole("button", { name: "Ice bolt" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fireball (preset)" }));
  expect(choose).toHaveBeenCalledWith("fire");
  expect(screen.queryByRole("dialog")).toBeNull();
});
