import { useState } from "react";
import { Wall, type MapImage } from "@vtt/shared";

/** Full-value geometry form shared by private draft and applied wall editors. */
export function WallProperties({ wall, map, onSave, disabled = false }: { wall: Wall; map: MapImage; onSave: (wall: Wall) => Promise<void> | void; disabled?: boolean }) {
  const [value, setValue] = useState(wall);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const point = (end: "a" | "b", axis: "x" | "y", number: number) => setValue((v) => ({ ...v, [end]: { ...v[end], [axis]: number } }));
  const portalPoint = (axis: "x" | "y", number: number) => setValue((v) => ({ ...v, uvttPortal: { ...v.uvttPortal, position: { ...(v.uvttPortal?.position ?? { x: 0, y: 0 }), [axis]: number } } }));
  return <form className="stack" aria-label="Geometry properties" onSubmit={(e) => {
    e.preventDefault();
    const parsed = Wall.safeParse(value);
    if (!parsed.success || value.a.x === value.b.x && value.a.y === value.b.y) { setError("Use finite coordinates and two distinct endpoints."); return; }
    setBusy(true); setError(null);
    void (async () => { await onSave(parsed.data); })().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not save geometry.")).finally(() => setBusy(false));
  }}>
    <fieldset className="stack geometry-fields" disabled={busy || disabled}>
    <h3 className="map-editor-heading">{wall.uvttPortal || wall.portal ? "Portal" : "Wall"} properties</h3>
    <p className="muted small-print">Coordinates are image pixels. Portal rotation is in radians.</p>
    {(["a", "b"] as const).map((end) => <div className="row" key={end}>
      {(["x", "y"] as const).map((axis) => <label className="stack" key={axis}>End {end.toUpperCase()} {axis.toUpperCase()}
        <input type="number" step="any" min="0" max={axis === "x" ? map.width : map.height} required value={Number.isFinite(value[end][axis]) ? value[end][axis] : ""} onChange={(e) => point(end, axis, e.target.valueAsNumber)} />
      </label>)}
    </div>)}
    {!value.uvttPortal && !value.portal && <label className="stack">Geometry source
      <select value={value.source ?? "line_of_sight"} onChange={(e) => setValue((v) => ({ ...v, source: e.target.value as Wall["source"] }))}>
        <option value="line_of_sight">Line of sight</option><option value="objects_line_of_sight">Object line of sight</option>
      </select>
    </label>}
    {value.uvttPortal && <label className="stack">Use as
      <select value={value.portal?.kind ?? "generic"} onChange={(e) => setValue((v) => {
        const { portal: _portal, ...generic } = v;
        return e.target.value === "generic" ? generic : { ...v, portal: { kind: e.target.value as "door" | "window", state: v.portal?.state ?? (v.uvttPortal?.closed === false ? "open" : "closed") } };
      })}><option value="generic">Generic UVTT portal (GM only)</option><option value="door">Door</option><option value="window">Window</option></select>
    </label>}
    {value.portal && <label className="stack">Portal state
      <select value={value.portal.state} onChange={(e) => setValue((v) => ({ ...v, portal: { ...v.portal!, state: e.target.value as "open" | "closed" | "locked" } }))}>
        <option value="open">Open</option><option value="closed">Closed</option><option value="locked">Locked</option>
      </select>
    </label>}
    <label><input type="checkbox" checked={Boolean(value.uvttPortal)} onChange={(e) => setValue((v) => {
      const { uvttPortal: _portal, ...solid } = v;
      return e.target.checked ? { ...v, uvttPortal: { closed: true, freestanding: false } } : solid;
    })} /> UVTT portal metadata</label>
    {value.uvttPortal && <>
      {!value.portal && <label><input type="checkbox" checked={value.uvttPortal.closed !== false} onChange={(e) => setValue((v) => ({ ...v, uvttPortal: { ...v.uvttPortal, closed: e.target.checked } }))} /> Closed (blocks movement)</label>}
      <label><input type="checkbox" checked={value.uvttPortal.freestanding ?? false} onChange={(e) => setValue((v) => ({ ...v, uvttPortal: { ...v.uvttPortal, freestanding: e.target.checked } }))} /> Freestanding</label>
      {(["x", "y"] as const).map((axis) => <label className="stack" key={axis}>Portal position {axis.toUpperCase()}
        <input type="number" step="any" value={value.uvttPortal?.position?.[axis] ?? ""} onChange={(e) => portalPoint(axis, e.target.valueAsNumber)} />
      </label>)}
      <label className="stack">Rotation (radians)
        <input type="number" step="any" value={value.uvttPortal.rotation ?? ""} onChange={(e) => setValue((v) => ({ ...v, uvttPortal: { ...v.uvttPortal, rotation: e.target.valueAsNumber } }))} />
      </label>
      <p className="muted small-print">Import does not infer a door or window. Designated portals follow the table’s existing visibility and player controls.</p>
    </>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save geometry"}</button>
    </fieldset>
  </form>;
}
