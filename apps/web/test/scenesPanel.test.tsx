// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyRoomState, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { ScenesPanel, SceneSwitcher } from "../src/panels/ScenesPanel";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
});
afterEach(cleanup);
function setup(state: RoomState = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } }) {
  const command = vi.fn().mockResolvedValue({ ok: true });
  render(<ScenesPanel state={state} connection={{ command } as unknown as RoomConnection} />);
  return command;
}
describe("scene management", () => {
  it("switches from the header selector without opening Manage", async () => {
    const state = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } };
    const command = vi.fn().mockResolvedValue({ ok: true });
    render(<SceneSwitcher state={state} connection={{ command } as unknown as RoomConnection} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Active scene" }), { target: { value: "cellar" } });
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.switch", sceneId: "cellar" }));
  });
  it("switches to a saved scene in one click", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Cellar" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.switch", sceneId: "cellar" }));
    expect((screen.getByRole("button", { name: "Switch to Tavern" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("starts a named blank scene and explains automatic saving", async () => {
    const command = setup(emptyRoomState("r"));
    expect(screen.getByText(/Progress saves automatically/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New scene name"), { target: { value: "Courtyard" } });
    fireEvent.click(screen.getByRole("button", { name: "Create scene" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.create", name: "Courtyard" }));
  });
  it("reports a refused switch without pretending it succeeded", async () => {
    const command = setup();
    command.mockResolvedValueOnce({ ok: false, message: "Scene was deleted" });
    fireEvent.click(screen.getByRole("button", { name: "Switch to Cellar" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Scene was deleted");
  });
  it("requires confirmation to delete an inactive scene", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete Cellar" }));
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete scene" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.delete", sceneId: "cellar" }));
  });
  it("renames a scene without switching", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename Cellar" }));
    fireEvent.change(screen.getByLabelText("Scene name"), { target: { value: "Vault" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.rename", sceneId: "cellar", name: "Vault" }));
  });
});
