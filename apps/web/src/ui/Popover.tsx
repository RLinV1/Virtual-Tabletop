import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A button that opens a small anchored panel (participants list, share link).
 *
 * Closes on Escape (returning focus to the button), on a second click, and on a pointer
 * press outside. Open state is local UI only; nothing here is persisted or sent.
 */
export function PopoverButton({
  label,
  buttonContent,
  title,
  align = "left",
  className = "tool-button",
  tourId,
  children,
}: {
  /** Accessible name of the button, e.g. "Participants, 3". */
  label: string;
  buttonContent: ReactNode;
  /** Accessible name of the opened panel. */
  title: string;
  /** Which edge of the button the panel lines up with. */
  align?: "left" | "right";
  className?: string;
  /** `data-tour` target for the guided tour. */
  tourId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="popover-anchor"
      data-tour={tourId}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonContent}
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={title} className={`popover popover-${align}`}>
          {children}
        </div>
      )}
    </div>
  );
}
