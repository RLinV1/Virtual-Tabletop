import { useEffect, useRef, useState } from "react";
import { Funnel } from "@phosphor-icons/react";

export interface BoardFilterState {
  fog: boolean;
  walls: boolean;
  portals: boolean;
}

/**
 * The GM's one "Show" menu for what their own board draws: fog, walls, and doors and windows
 * (FR-GM-17, ADR 0029, ADR 0030). It changes only this browser's view; players see what the
 * room shows them. A row appears only when the room has that kind of thing.
 */
export function BoardFilters({ value, available, onChange }: {
  value: BoardFilterState;
  available: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const rows: { key: keyof BoardFilterState; label: string }[] = [
    { key: "fog", label: "Fog" },
    { key: "walls", label: "Walls" },
    { key: "portals", label: "Doors and windows" },
  ];
  const shown = rows.filter((row) => available[row.key]);
  if (shown.length === 0) return null;

  return (
    <div className="board-filters" ref={root}>
      <button type="button" className="tool-button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((now) => !now)} title="Choose what your view shows">
        <Funnel size={16} aria-hidden="true" />
        Show
      </button>
      {open && (
        <div className="board-filters-menu" role="group" aria-label="Show on your view">
          {shown.map(({ key, label }) => (
            <label key={key} className="board-filters-row">
              <input type="checkbox" checked={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
