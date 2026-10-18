// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { EffectsPanel, mapCentre } from "../src/panels/EffectsPanel";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

const connectionWith = () => {
  const command = vi.fn(async (_command: unknown) => ({ ok: true as const, seq: 1 }));
  return { connection: { command } as unknown as RoomConnection, command };
};

describe("GM table effects (FR-TAC-06, ADR 0038)", () => {
  it("sends room.setReducedEffects from the Reduced animations switch", async () => {
    const { connection, command } = connectionWith();
    render(<EffectsPanel connection={connection} state={emptyRoomState("r")} />);
    fireEvent.click(screen.getByRole("switch", { name: "Reduced animations" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "room.setReducedEffects", enabled: true }));
  });

  it("shows the switch on when the table is reduced", () => {
    const { connection } = connectionWith();
    render(<EffectsPanel connection={connection} state={{ ...emptyRoomState("r"), reducedEffects: true }} />);
    expect((screen.getByRole("switch", { name: "Reduced animations" }) as HTMLInputElement).checked).toBe(true);
  });

  it("asks before detonating, then sends nuke.detonate at the map centre", async () => {
    const { connection, command } = connectionWith();
    const state = emptyRoomState("r");
    render(<EffectsPanel connection={connection} state={state} />);
    fireEvent.change(screen.getByLabelText(/Damage to every token/), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Detonate…" }));
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Detonate" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "nuke.detonate", amount: 25, origin: mapCentre(state) }));
  });

  it("refuses an amount outside 1-999 before asking", () => {
    const { connection } = connectionWith();
    render(<EffectsPanel connection={connection} state={emptyRoomState("r")} />);
    fireEvent.change(screen.getByLabelText(/Damage to every token/), { target: { value: "1000" } });
    expect((screen.getByRole("button", { name: "Detonate…" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
