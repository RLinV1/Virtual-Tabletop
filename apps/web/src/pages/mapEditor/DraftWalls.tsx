import { useState } from "react";
import { MAX_WALLS, removePortalOverlaps, type GridSpec, type MapImage, type Wall } from "@vtt/shared";
import { WallCanvas, type CanvasMode } from "./WallCanvas";
import { WallProperties } from "./WallProperties";

/** Local-only geometry reuses the same picking, drawing, erase, snapping and properties. */
export function DraftWalls({ map, grid, walls, onChange, onApply, busy, error }: {
  map: MapImage; grid: GridSpec; walls: Record<string, Wall>; onChange: (walls: Record<string, Wall>) => void;
  onApply: () => void; busy: boolean; error: string | null;
}) {
  const [mode, setMode] = useState<CanvasMode>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const change = (next: Record<string, Wall>) => {
    const normalized = removePortalOverlaps(Object.values(next));
    if (normalized.length > MAX_WALLS) throw new Error(`At most ${MAX_WALLS} walls are supported after portal normalization. Remove some before editing.`);
    const ids = new Set<string>();
    onChange(Object.fromEntries(normalized.map((wall) => {
      const id = ids.has(wall.id) ? crypto.randomUUID() : wall.id;
      ids.add(id); return [id, { ...wall, id }];
    })));
    setLocalError(null);
  };
  return <div className="map-editor-split">
    <WallCanvas key={map.url} map={map} grid={grid} walls={walls} mode={mode} busy={busy}
      onSelect={setSelected} selectedId={selected ?? undefined} onSample={() => {}}
      onAdd={(a, b) => {
        const id = crypto.randomUUID();
        try { change({ ...walls, [id]: { id, a, b } }); }
        catch (error) { setLocalError(error instanceof Error ? error.message : "Could not draw this wall."); }
      }} onRemove={(id) => { const { [id]: _removed, ...remaining } = walls; onChange(remaining); }} />
    <aside className="map-editor-hud" aria-label="Draft wall tools">
      <h3 className="map-editor-heading">Draft walls and portals</h3>
      <p className="muted">Only you see these {Object.keys(walls).length} segments until Apply map.</p>
      <div className="map-editor-modes" role="radiogroup" aria-label="Draft wall tool">
        {([ ["select", "Select / edit"], ["draw", "Draw"], ["erase", "Erase"], ["pan", "Pan"] ] as const).map(([key, label]) =>
          <button type="button" role="radio" aria-checked={mode === key} key={key} disabled={busy} onClick={() => setMode(key)}>{label}</button>)}
      </div>
      <p className="muted small-print">Select a segment on the map, or from the list. Drawing snaps to grid corners and existing endpoints; Alt places freely.</p>
      <label className="stack">Selected geometry
        <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
          <option value="">Choose a segment</option>
          {Object.values(walls).map((w, i) => <option key={w.id} value={w.id}>{w.portal ? "Portal" : "Wall"} {i + 1}</option>)}
        </select>
      </label>
      {selected && walls[selected] && <WallProperties key={`${selected}:${revision}:${JSON.stringify(walls[selected])}`} disabled={busy} wall={walls[selected]!} map={map} onSave={async (wall) => {
        change({ ...walls, [wall.id]: wall }); setRevision((v) => v + 1);
      }} />}
      <button type="button" disabled={busy} onClick={onApply}>{busy ? "Applying map…" : "Apply map"}</button>
      {(error || localError) && <p role="alert" className="error">{error ?? localError}</p>}
    </aside>
  </div>;
}
