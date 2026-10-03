import { useState } from "react";
import { MAX_CHECKPOINT_NAME, type Checkpoint, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/**
 * Named checkpoints (KAN-41, FR-REC-02, ADR 0017): the GM saves the board under a name and can put
 * it back later. Restoring resets the map, tokens, areas, fog and initiative, never chat or
 * rolls, and can itself be undone from the activity log. GM-only: players never get the list.
 */
export function CheckpointsPanel({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<Checkpoint | null>(null);
  const newestFirst = [...state.checkpoints].reverse();

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the checkpoint a name.");
    setBusy(true);
    const result = await connection.command({ type: "checkpoint.create", name: trimmed });
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setName("");
      setStatus(`Saved checkpoint "${trimmed}".`);
    }
  };

  const restore = async (checkpoint: Checkpoint) => {
    setBusy(true);
    const result = await connection.command({ type: "checkpoint.restore", checkpointId: checkpoint.id });
    setBusy(false);
    setConfirming(null);
    setError(result.ok ? null : result.message);
    if (result.ok) setStatus(`Restored checkpoint "${checkpoint.name}". Undo it from the activity log if that was wrong.`);
  };

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
            placeholder="Before the ambush"
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
              <button
                type="button"
                className="secondary"
                disabled={busy}
                aria-label={`Restore ${c.name}`}
                onClick={() => setConfirming(c)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
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
    </PanelSection>
  );
}
