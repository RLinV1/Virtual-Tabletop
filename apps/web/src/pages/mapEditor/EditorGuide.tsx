import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GuideIcon, GuideTour } from "../../ui/GuideTour";
import { EDITOR_GUIDES } from "./mapEditorGuides";

/** The Guide button in the map editor's header: tours the controls of the current step. */
export function EditorGuide({ step }: { step: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const steps = EDITOR_GUIDES[step];
  if (!steps) return null;
  return (
    <>
      <button ref={button} type="button" className="secondary small map-editor-guide" onClick={() => setOpen(true)}>
        <GuideIcon /> Guide
      </button>
      {/* Inside the editor dialog, so its inert page and focus trap do not cover the tour. */}
      {open && createPortal(
        <GuideTour steps={steps} onClose={() => { setOpen(false); button.current?.focus(); }} />,
        button.current?.closest("dialog") ?? document.body,
      )}
    </>
  );
}
