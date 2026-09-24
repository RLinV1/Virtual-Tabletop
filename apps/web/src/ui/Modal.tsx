import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal on the native `<dialog>` (room-sidebar-layout: GM setup forms open in modals).
 *
 * `showModal()` gives the focus trap, top-layer stacking, inert page and Escape for free;
 * this adds the title bar, backdrop-click dismissal and focus return to the opener.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  /** Whatever had focus when the modal opened, usually the button that opened it. */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      // Escape: let React state drive the close so `open` stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => opener.current?.focus()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Handle it here rather than relying on the dialog's cancel event, which a focused
        // search field swallows. Stop it so a modal stacked inside another closes alone.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      // A click on the dialog element itself is a click on the backdrop; content clicks
      // land on its children.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
