import { useEffect, useRef, useState } from "react";
import type { AnimationDef } from "@vtt/shared";
import { AnimationPreview } from "../board/animationPreview";

/**
 * The editor's preview (ADR 0038): a mount point for `AnimationPreview` and a Play button that
 * plays the values as they are now, saved or not. It sends nothing to any room and changes no data.
 */
export function AnimationPreviewStage({ def, reducedMotion }: { def: AnimationDef; reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<AnimationPreview | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const stage = new AnimationPreview(host.current!);
    preview.current = stage;
    let live = true;
    void stage.init().then((ok) => {
      if (live && !ok) setUnavailable(true);
    });
    return () => {
      live = false;
      stage.destroy();
      preview.current = null;
    };
  }, []);

  return (
    <div className="animation-preview">
      <div ref={host} className="animation-preview-stage" role="img" aria-label="Animation preview stage" />
      {unavailable && <p className="muted small-print">The preview needs WebGL, which this browser does not offer.</p>}
      <button type="button" className="secondary" onClick={() => preview.current?.play(def, reducedMotion)}>
        Play
      </button>
    </div>
  );
}
