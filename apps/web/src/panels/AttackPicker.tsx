import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CaretDown, Check, Sword } from "@phosphor-icons/react";
import { presetSummary, type AttackPreset } from "./attackRoll";

/**
 * Picks one of a token's named attacks (attack-panel-encounter-reset). A select-only combobox:
 * the closed control stays one row tall however many attacks there are, and it opens a list
 * styled like the app's popovers. A native <select> can't show the name and dice in the app's
 * type, so this follows the WAI-ARIA select-only combobox pattern instead: focus stays on the
 * button, and the highlighted option is announced through aria-activedescendant.
 */
export function AttackPicker({
  presets,
  selected,
  onSelect,
  label,
  disabled,
}: {
  presets: AttackPreset[];
  selected: number;
  onSelect: (index: number) => void;
  /** Accessible name, e.g. "Goblin's attack". */
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const chosen = presets[selected];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted option in view while moving through a long list.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (i: number) => {
    onSelect(i);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = presets.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const moves: Record<string, number> = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]!);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="attack-picker">
      <button
        type="button"
        role="combobox"
        className="attack-picker-button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <Sword size={16} aria-hidden="true" />
        <span className="attack-picker-name">{chosen?.name}</span>
        {chosen && <span className="attack-picker-dice">{presetSummary(chosen)}</span>}
        <CaretDown size={12} weight="bold" className="attack-picker-caret" aria-hidden="true" />
      </button>
      <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="attack-picker-list" hidden={!open}>
        {presets.map((preset, i) => (
          <li
            key={`${i}:${preset.name}`}
            id={optionId(i)}
            role="option"
            aria-selected={i === selected}
            className={i === active ? "attack-picker-option active" : "attack-picker-option"}
            // Keep focus on the button, so the keyboard keeps working after a pointer hover.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <Check size={14} weight="bold" className="attack-picker-check" aria-hidden="true" />
            <span className="attack-picker-name">{preset.name}</span>
            <span className="attack-picker-dice">{presetSummary(preset)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
