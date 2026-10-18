import { useState } from "react";
import { Modal } from "./Modal";
import type { PickerOption } from "./Picker";

/** A dedicated dialog keeps long animation lists clear of a host form's scroll area. */
export function SearchablePicker({ label, value, options, onChange }: {
  label: string; value: string; options: PickerOption[]; onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <button type="button" className="secondary" aria-label={label} onClick={() => { setQuery(""); setOpen(true); }}>
      {options.find((option) => option.key === value)?.label ?? "Choose animation"}
    </button>
    <Modal open={open} title="Choose attack animation" onClose={() => setOpen(false)}>
      <div className="stack">
        <input type="search" aria-label="Search animations" placeholder="Search animations" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="stack" role="group" aria-label="Animations">
          {filtered.map((option) => <button key={option.key} type="button" className="secondary" aria-pressed={option.key === value}
            onClick={() => { onChange(option.key); setOpen(false); }}>{option.label}{option.detail ? ` (${option.detail})` : ""}</button>)}
          {filtered.length === 0 && <p role="status">No animations match your search.</p>}
        </div>
      </div>
    </Modal>
  </>;
}
