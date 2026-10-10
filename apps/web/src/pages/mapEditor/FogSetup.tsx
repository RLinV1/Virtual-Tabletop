import { useState } from "react";
import { Eye, Hand, Polygon, Rectangle } from "@phosphor-icons/react";
import type { RoomState } from "@vtt/shared";
import type { RoomConnection } from "../../net/roomConnection";
import { FogControls } from "../../panels/FogPanel";
import { FogCanvas, type FogAdd, type FogCanvasMode } from "./FogCanvas";

const MODES: { key: FogCanvasMode; label: string; icon: typeof Eye }[] = [
  { key: "rect", label: "Rectangle", icon: Rectangle },
  { key: "polygon", label: "Polygon", icon: Polygon },
  { key: "reveal", label: "Reveal", icon: Eye },
  { key: "pan", label: "Pan", icon: Hand },
];

const HINTS: Record<FogCanvasMode, string> = {
  rect: "Drag to fog a rectangle.",
  polygon: "Click each corner. Click the first corner or press Enter to close it. Esc or right-click drops it.",
  reveal: "Click a fogged region to reveal what it covers.",
  pan: "Drag to move around. The wheel or a pinch zooms; Space-drag or a two-finger drag pans in any tool.",
};

/**
 * The map editor's Fog step (map-editor, FR-GM-17): the fog canvas, and a side HUD with the tools
 * and the same controls as Manage › Fog of war. It sends the board Fog tool's `fog.add` and
 * `fog.remove`, so players see no difference.
 */
export function FogSetup({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const map = state.scene.map;
  const [mode, setMode] = useState<FogCanvasMode>("rect");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (!map) return <p className="map-editor-empty">Apply a map in the Map step first, then set up its fog here.</p>;

  const send = async (command: { type: "fog.add"; region: FogAdd } | { type: "fog.remove"; regionId: string }) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setMessage(result.ok ? null : { text: result.message, error: true });
  };

  const regions = Object.keys(state.fog).length;
  return (
    <div className="map-editor-split">
      <FogCanvas
        map={map}
        grid={state.scene.grid}
        fog={state.fog}
        mode={mode}
        busy={busy}
        onAdd={(region) => void send({ type: "fog.add", region })}
        onRemove={(regionId) => void send({ type: "fog.remove", regionId })}
        onNotice={(text) => setMessage({ text, error: true })}
      />
      <aside className="map-editor-hud" aria-label="Fog tools">
        <section className="stack">
          <h3 className="map-editor-heading">Tools</h3>
          <div className="map-editor-modes" role="radiogroup" aria-label="Fog tool">
            {MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                className="tool-button map-editor-mode"
                onClick={() => { setMode(key); setMessage(null); }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="muted small-print">{HINTS[mode]}</p>
          <p className="map-editor-count">
            {regions} fogged {regions === 1 ? "region" : "regions"}. Players can't see anything under fog. Only you see it as drawn here.
          </p>
        </section>
        <section className="stack">
          <h3 className="map-editor-heading">Fog controls</h3>
          <FogControls connection={connection} state={state} intro="Fog the whole map, or a block of cells, without the pointer." />
        </section>
        {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      </aside>
    </div>
  );
}
