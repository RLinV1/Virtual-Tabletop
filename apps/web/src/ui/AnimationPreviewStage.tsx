import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AnimationDef } from "@vtt/shared";
import { AnimationPreview } from "../board/animationPreview";
import { DEFAULT_SCENE, type StageScene, type StageSlot } from "../board/previewStage";

/**
 * The editor's preview (ADR 0038): a mount point for `AnimationPreview` and a Play button that
 * plays the values as they are now, saved or not. It sends nothing to any room and changes no data.
 * `scene` is the GM's own map and token art for the stage; a picture that cannot load is reported
 * through `onSceneMissing` and the stage keeps its default there.
 */
export function AnimationPreviewStage({ def, scene = DEFAULT_SCENE, onSceneMissing, children }: {
  def: AnimationDef;
  scene?: StageScene;
  onSceneMissing?: (slot: StageSlot) => void;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<AnimationPreview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stage = new AnimationPreview(host.current!);
    preview.current = stage;
    let live = true;
    void stage.init().then((ok) => {
      if (live) { setUnavailable(!ok); setReady(ok); }
    });
    return () => {
      live = false;
      stage.destroy();
      preview.current = null;
    };
  }, []);

  // Runs after the stage above is made, so the first scene reaches it too.
  useEffect(() => {
    preview.current?.setScene(scene, onSceneMissing);
  }, [scene, onSceneMissing]);

  return (
    <div className="animation-preview">
      <div ref={host} className="animation-preview-stage" role="img" aria-label="Animation preview stage with attacker and target tokens" />
      {unavailable && <p className="muted small-print">The preview needs WebGL, which this browser does not offer.</p>}
      <div className="animation-preview-toolbar">
        <button type="button" disabled={!ready} onClick={() => preview.current?.play(def)}>Play</button>
        <button type="button" className="secondary" disabled={!ready} onClick={() => preview.current?.stop()}>Stop</button>
        {children}
      </div>
    </div>
  );
}
