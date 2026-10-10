import { useEffect, useRef, useState } from "react";
import type { Command, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";
import { cellsRegion, coversWholeMap, describeCells, gridSize, wholeMapRegion, type Cell } from "./fogCells";

/**
 * Fog of war without a pointer (FR-GM-17, ADR 0016). The board's Fog tool needs a mouse or a
 * finger; this GM-only section does the same by keyboard: fog the whole map, fog a block of
 * cells, and reveal any region from a list. It sends the same `fog.add` / `fog.remove` commands.
 */
export function FogPanel({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  return (
    <PanelSection id="gm-fog" title="Fog of war">
      <FogControls connection={connection} state={state} intro="Players can't see anything under fog. Draw it on the board with the Fog tool, or use the controls here." />
    </PanelSection>
  );
}

/**
 * The fog controls themselves, shared by the Manage tab's section and the map editor's Fog step:
 * whole map, a block of cells, and the list of regions with Reveal.
 */
export function FogControls({ connection, state, intro }: { connection: RoomConnection; state: RoomState; intro: string }) {
  const { map, grid } = state.scene;
  const regions = Object.values(state.fog);
  const size = map ? gridSize(map, grid) : null;
  const [from, setFrom] = useState<Cell>({ col: 1, row: 1 });
  const [to, setTo] = useState<Cell>({ col: 1, row: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  /** After a reveal: the region removed and its place in the list, to move focus once it has gone. */
  const [revealed, setRevealed] = useState<{ id: string; index: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);

  // A reveal removes the focused button; once the region has left state, hand focus to its
  // neighbour, or to the summary if none is left.
  useEffect(() => {
    if (!revealed || state.fog[revealed.id]) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
    const next = buttons[Math.min(revealed.index, buttons.length - 1)];
    (next ?? headingRef.current)?.focus();
    setRevealed(null);
  }, [revealed, state.fog]);

  /** What the list and its Reveal button call a region: "Whole map", or its shape and cells. */
  const label = (id: string) => {
    const region = state.fog[id];
    if (!region || !map) return "fog";
    if (coversWholeMap(region, map)) return "Whole map";
    const kind = region.shape === "rect" ? "Rectangle" : `Polygon, ${region.points.length} corners`;
    return `${kind} · ${describeCells(region, map, grid)}`;
  };

  /** Send a `fog.add`; on success, announce `done`. */
  const add = async (command: Extract<Command, { type: "fog.add" }>, done: string) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) setStatus(done);
  };

  /** Remove a region, announce it, and queue focus for the button that takes its place. */
  const reveal = async (id: string, index: number) => {
    const what = label(id);
    setBusy(true);
    const result = await connection.command({ type: "fog.remove", regionId: id });
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setStatus(`Revealed: ${what}.`);
      setRevealed({ id, index });
    }
  };

  return (
    <>
      {!map || !size ? (
        <p className="muted">Set a battle map to use fog.</p>
      ) : (
        <>
          <p className="muted">{intro}</p>
          <div className="row button-row">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void add({ type: "fog.add", region: wholeMapRegion(map) }, "Fogged the whole map.")}
            >
              Fog whole map
            </button>
          </div>
          <form
            className="fog-cells"
            onSubmit={(e) => {
              e.preventDefault();
              const region = cellsRegion(from, to, map, grid);
              void add({ type: "fog.add", region }, `Fogged ${describeCells({ points: [region.from, region.to] }, map, grid)}.`);
            }}
          >
            <fieldset>
              <legend>Fog a block of cells</legend>
              <p className="muted fog-cells-hint">
                Count from the top-left of the map: {size.cols} columns, {size.rows} rows.
              </p>
              <div className="fog-cells-grid">
                <CellInput label="From column" value={from.col} max={size.cols} onChange={(col) => setFrom((c) => ({ ...c, col }))} />
                <CellInput label="From row" value={from.row} max={size.rows} onChange={(row) => setFrom((c) => ({ ...c, row }))} />
                <CellInput label="To column" value={to.col} max={size.cols} onChange={(col) => setTo((c) => ({ ...c, col }))} />
                <CellInput label="To row" value={to.row} max={size.rows} onChange={(row) => setTo((c) => ({ ...c, row }))} />
              </div>
              <button type="submit" className="secondary" disabled={busy}>
                Fog cells
              </button>
            </fieldset>
          </form>
          <p ref={headingRef} tabIndex={-1} className="fog-count">
            {regions.length === 0 ? "No fog on the map." : `${regions.length} fogged ${regions.length === 1 ? "region" : "regions"}`}
          </p>
          {regions.length > 0 && (
            <ul ref={listRef} className="plain fog-list" aria-label="Fogged regions">
              {regions.map((region, i) => (
                <li key={region.id} className="fog-row">
                  <span>{label(region.id)}</span>
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy}
                    aria-label={`Reveal ${label(region.id)}`}
                    onClick={() => void reveal(region.id, i)}
                  >
                    Reveal
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="sr-only" role="status">{status}</p>
    </>
  );
}

/** A whole-number cell field, kept between 1 and `max` as the GM types. */
function CellInput({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        required
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(1, n)));
        }}
      />
    </label>
  );
}
