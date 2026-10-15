import { useEffect, useState } from "react";
import type { EncounterPreview } from "@vtt/shared";
import { api } from "../net/api";
import { Modal } from "../ui/Modal";
import { MapCanvas } from "./mapEditor/MapCanvas";

/**
 * A read-only look at a saved encounter template (encounter-templates): its map and grid, every
 * token (hidden ones dimmed, since this is the GM's own library) and its fog, drawn on the map
 * editor's pan-and-zoom canvas. Nothing here can change the template.
 */
export function EncounterPreviewModal({ templateId, name, onClose }: { templateId: string | null; name: string; onClose: () => void }) {
  const [preview, setPreview] = useState<EncounterPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!templateId) return;
    let live = true;
    api.library.encounters.preview(templateId).then(
      (next) => { if (live) setPreview(next); },
      (err: unknown) => { if (live) setError(err instanceof Error ? err.message : "Couldn't load the preview"); },
    );
    return () => { live = false; };
  }, [templateId]);

  return (
    <Modal open={templateId !== null} title={`Preview: ${name}`} className="map-editor encounter-preview" onClose={onClose}>
      <div className="map-editor-shell">
        <div className="map-editor-body">
          {error && <p role="alert" className="error">{error}</p>}
          {!preview && !error && <p className="muted">Loading…</p>}
          {preview && (
            <MapCanvas map={preview.map} grid={preview.grid} mode="view" pan label={`Preview of ${name}`}>
              {() => (
                <>
                  {preview.fog.map((region, i) => (
                    <polygon key={`f${i}`} points={region.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="#000" fillOpacity={0.6} stroke="#fff" strokeOpacity={0.4} />
                  ))}
                  {preview.tokens.map((token, i) => {
                    const radius = (token.size * preview.grid.cellSize) / 2;
                    return (
                      <g key={`t${i}`} opacity={token.hidden ? 0.45 : 1}>
                        <circle cx={token.position.x} cy={token.position.y} r={radius} fill={token.color} stroke="#fff" strokeWidth={Math.max(2, radius / 12)} strokeDasharray={token.hidden ? "6 4" : undefined} />
                        {token.imageUrl && (
                          <image
                            href={token.imageUrl}
                            x={token.position.x - radius} y={token.position.y - radius}
                            width={radius * 2} height={radius * 2}
                            preserveAspectRatio="xMidYMid slice"
                            clipPath={`circle(${radius}px at ${radius}px ${radius}px)`}
                          />
                        )}
                        <title>{token.hidden ? `${token.name} (hidden)` : token.name}</title>
                      </g>
                    );
                  })}
                </>
              )}
            </MapCanvas>
          )}
        </div>
      </div>
    </Modal>
  );
}
