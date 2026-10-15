import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_GRID, emptyRoomState, type LibraryAsset, type LibraryMapBoard } from "@vtt/shared";
import { api } from "../../net/api";
import { createDraftConnection } from "./draftConnection";
import { Modal } from "../../ui/Modal";
import { FogSetup } from "./FogSetup";
import { WallSetup } from "./WallSetup";
import type { MapDraft } from "./mapDraft";
import { boardChanged, boardFromDraft, draftFromBoard } from "./libraryBoardDraft";

type Step = "grid" | "walls" | "fog";
const STEPS: { key: Step; label: string }[] = [
  { key: "grid", label: "1 · Grid" },
  { key: "walls", label: "2 · Walls" },
  { key: "fog", label: "3 · Fog" },
];

/**
 * The library's map editor (asset-library): the room editor's Grid, Walls and Fog steps on a
 * library map, with no room behind it. Walls and fog are a private draft saved to the map with Save
 * changes (ADR 0037); the Grid step is the library's own form and saves separately. Automatic wall
 * detection is not offered here, since it runs against a room.
 */
export function LibraryMapEditor({ asset, gridStep, onClose }: {
  /** The map being edited, or null when the editor is closed. */
  asset: LibraryAsset | null;
  /** The Grid step's content, which saves the grid itself. */
  gridStep: ReactNode;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("grid");
  const [stored, setStored] = useState<LibraryMapBoard | null>(null);
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const assetId = asset?.id ?? null;
  const mapUrl = asset?.url ?? "";

  useEffect(() => {
    setStep("grid");
    setStored(null);
    setDraft(null);
    setLoadError(null);
    setSaveError(null);
    if (!assetId) return;
    let live = true;
    api.library.board(assetId).then(
      (board) => { if (live) { setStored(board); setDraft(draftFromBoard(mapUrl, board)); } },
      (err: unknown) => { if (live) setLoadError(err instanceof Error ? err.message : "Could not load this map's walls and fog"); },
    );
    return () => { live = false; };
  }, [assetId, mapUrl]);

  const dirty = draft !== null && stored !== null && boardChanged(draft, stored);
  const size = asset ? { width: asset.width, height: asset.height } : null;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Wall and fog commands from the steps change the draft; there is no room to send anything to.
  const connection = useMemo(
    () => createDraftConnection((change) => setDraft((current) => (current ? change(current) : current)), () => sizeRef.current),
    [],
  );

  const state = useMemo(() => {
    if (!asset || !draft) return null;
    return {
      ...emptyRoomState("library"),
      scene: { map: { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id }, grid: asset.grid ?? DEFAULT_GRID },
      walls: draft.walls,
      fog: draft.fog,
    };
  }, [asset, draft]);

  const save = async () => {
    if (!asset || !draft || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      setStored(await api.library.setBoard(asset.id, boardFromDraft(draft)));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the walls and fog");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard your unsaved wall and fog changes?")) return;
    onClose();
  };

  return (
    <Modal
      open={asset !== null}
      title={asset?.grid ? "Edit map" : "Set up map"}
      className="map-editor"
      onClose={close}
      headerContent={(
        <nav className="map-editor-steps" role="tablist" aria-label="Map setup steps">
          {STEPS.map(({ key, label }) => (
            <button key={key} type="button" role="tab" aria-selected={step === key} className="map-editor-step" onClick={() => setStep(key)}>
              {label}
            </button>
          ))}
          {dirty && (
            <span className="map-editor-unsaved">
              <span className="map-editor-draft">Unsaved changes: not saved to this map yet</span>
              <button type="button" className="secondary small" disabled={saving} onClick={() => stored && setDraft(draftFromBoard(mapUrl, stored))}>Discard</button>
              <button type="button" className="small" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</button>
            </span>
          )}
          {saveError && <span role="alert" className="error map-editor-save-error">{saveError}</span>}
        </nav>
      )}
    >
      <div className="map-editor-shell">
        <div className="map-editor-body" role="tabpanel">
          {step === "grid" && gridStep}
          {step !== "grid" && loadError && <p role="alert" className="error">{loadError}</p>}
          {step !== "grid" && !loadError && !state && <p className="muted">Loading…</p>}
          {step === "walls" && state && <WallSetup connection={connection} state={state} token="" detection={false} />}
          {step === "fog" && state && <FogSetup connection={connection} state={state} />}
        </div>
      </div>
    </Modal>
  );
}
