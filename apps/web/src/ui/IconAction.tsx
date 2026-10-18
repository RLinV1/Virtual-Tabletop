import type { ReactNode } from "react";

/** A small icon-only action, named for assistive tech and as a tooltip: Edit, Rename, Delete… */
export function IconAction({ icon, label, onClick, danger, disabled }: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={danger ? "icon-button token-delete" : "icon-button"} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  );
}
