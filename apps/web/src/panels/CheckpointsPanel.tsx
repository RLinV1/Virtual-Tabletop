import { useEffect, useState } from "react";
import { MAX_CHECKPOINT_NAME, type Checkpoint, type CheckpointPreviewResponse, type RoomState, type TableState } from "@vtt/shared";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/** What a saved board holds, in the words the preview shows (ADR 0036). Hidden tokens are marked, not left out: this is the GM's view. */
export function summarizeTable(table: TableState) {
  const nameOf = (id: string) => table.tokens[id]?.name ?? "A deleted token";
  const { initiative } = table;
  return {
    map: table.scene.map ? `${table.scene.map.width} × ${table.scene.map.height} px` : "No map",
    tokens: Object.values(table.tokens).map((t) => ({ id: t.id, name: t.name, hidden: t.hidden })),
    areas: Object.keys(table.templates).length,
    fog: Object.keys(table.fog).length,
    walls: Object.keys(table.walls ?? {}).length,
    initiative: initiative
      ? { round: initiative.round, order: initiative.order.map((id, i) => ({ id, name: nameOf(id), active: i === initiative.activeIndex })) }
      : null,
  };
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Named checkpoints (KAN-41, FR-REC-02, ADR 0019, ADR 0036): the GM saves the board under a name,
 * looks at what a checkpoint holds, puts it back later, or deletes it. Restoring resets the map,
 * tokens, areas, fog and initiative, never chat or rolls, and can itself be undone from the
 * activity log. Deleting only removes the bookmark. GM-only: players never get the list.
 */
export function CheckpointsPanel({ connection, state, token }: { connection: RoomConnection; state: RoomState; token: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<Checkpoint | null>(null);
  const [deleting, setDeleting] = useState<Checkpoint | null>(null);
  const [previewing, setPreviewing] = useState<Checkpoint | null>(null);
  const [preview, setPreview] = useState<CheckpointPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const newestFirst = [...state.checkpoints].reverse();

  // The saved board is read from the server (a replay of the log), only while its preview is open.
  useEffect(() => {
    if (!previewing) return;
    const controller = new AbortController();
    setPreview(null);
    setPreviewError(null);
    api.checkpointPreview(state.roomId, token, previewing.id, controller.signal).then(
      setPreview,
      (err: unknown) => {
        if (!controller.signal.aborted) setPreviewError(err instanceof Error ? err.message : "Couldn't load that checkpoint.");
      },
    );
    return () => controller.abort();
  }, [previewing, state.roomId, token]);

  const save = async () => {
    if (busy) return; // Enter pressed twice must not save two checkpoints.
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the checkpoint a name.");
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.create", name: trimmed });
      setError(result.ok ? null : result.message);
      if (result.ok) {
        setName("");
        setStatus(`Saved checkpoint "${trimmed}".`);
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async (checkpoint: Checkpoint) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.restore", checkpointId: checkpoint.id });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Restored checkpoint "${checkpoint.name}". Undo it from the activity log if that was wrong.`);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const remove = async (checkpoint: Checkpoint) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connection.command({ type: "checkpoint.delete", checkpointId: checkpoint.id });
      setError(result.ok ? null : result.message);
      if (result.ok) setStatus(`Deleted checkpoint "${checkpoint.name}".`);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const summary = preview ? summarizeTable(preview.table) : null;

  return (
    <PanelSection id="gm-checkpoints" title="Checkpoints">
      <p className="muted">Save the board now and put it back later. Chat and dice rolls are kept.</p>
      <form
        className="row checkpoint-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="checkpoint-name">
          <span className="sr-only">Checkpoint name</span>
          <input
            value={name}
            maxLength={MAX_CHECKPOINT_NAME}
            placeholder="Checkpoint name"
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="secondary" disabled={busy}>
          Save
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status" className="sr-only">{status}</p>
      {newestFirst.length === 0 ? (
        <p className="muted">No checkpoints yet.</p>
      ) : (
        <ul className="plain checkpoint-list">
          {newestFirst.map((c) => (
            <li key={c.id} className="checkpoint-row">
              <span>{c.name}</span>
              <span className="row checkpoint-actions">
                <button type="button" className="secondary" disabled={busy} aria-label={`Preview ${c.name}`} onClick={() => setPreviewing(c)}>
                  Preview
                </button>
                <button type="button" className="secondary" disabled={busy} aria-label={`Restore ${c.name}`} onClick={() => setConfirming(c)}>
                  Restore
                </button>
                <button type="button" className="secondary" disabled={busy} aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal open={previewing !== null} title={previewing ? `Preview: ${previewing.name}` : "Preview"} onClose={() => setPreviewing(null)}>
        {previewing && (
          <div className="stack checkpoint-preview">
            {previewError && <p role="alert" className="error">{previewError}</p>}
            {!summary && !previewError && <p className="muted" role="status">Loading the saved board…</p>}
            {summary && (
              <>
                <p className="muted">The board as it was when this checkpoint was saved. Nothing changes until you restore.</p>
                <dl className="checkpoint-summary">
                  <dt>Map</dt>
                  <dd>{summary.map}</dd>
                  <dt>Tokens</dt>
                  <dd>
                    {summary.tokens.length === 0 ? "None" : (
                      <ul className="plain">
                        {summary.tokens.map((t) => <li key={t.id}>{t.name}{t.hidden && <span className="muted"> (hidden)</span>}</li>)}
                      </ul>
                    )}
                  </dd>
                  <dt>Areas</dt>
                  <dd>{count(summary.areas, "area")}</dd>
                  <dt>Fog</dt>
                  <dd>{count(summary.fog, "fog region")}</dd>
                  <dt>Walls</dt>
                  <dd>{count(summary.walls, "wall")}</dd>
                  <dt>Initiative</dt>
                  <dd>
                    {summary.initiative === null ? "Not running" : (
                      <>
                        <span>Round {summary.initiative.round}</span>
                        <ol>
                          {summary.initiative.order.map((e, i) => <li key={`${e.id}-${i}`}>{e.name}{e.active && <strong> (up now)</strong>}</li>)}
                        </ol>
                      </>
                    )}
                  </dd>
                </dl>
              </>
            )}
            <div className="row button-row">
              <button type="button" disabled={busy || !summary} onClick={() => { setConfirming(previewing); setPreviewing(null); }}>
                Restore {previewing.name}
              </button>
              <button type="button" className="secondary" onClick={() => setPreviewing(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={confirming !== null} title="Restore checkpoint?" onClose={() => setConfirming(null)}>
        {confirming && (
          <div className="stack">
            <p>
              Put the board back to <strong>{confirming.name}</strong>? The map, tokens, areas, fog and initiative go back
              to how they were. Chat and dice rolls stay. You can undo this from the activity log.
            </p>
            <div className="row button-row">
              <button type="button" disabled={busy} onClick={() => void restore(confirming)}>
                Restore {confirming.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={deleting !== null} title="Delete checkpoint?" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="stack">
            <p>
              Delete <strong>{deleting.name}</strong>? The board stays as it is, but this checkpoint can't be restored
              afterwards, and deleting it can't be undone.
            </p>
            <div className="row button-row">
              <button type="button" disabled={busy} onClick={() => void remove(deleting)}>
                Delete {deleting.name}
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PanelSection>
  );
}
