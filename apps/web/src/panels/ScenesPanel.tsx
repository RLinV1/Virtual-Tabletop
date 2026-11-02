import { useState } from "react";
import { INITIAL_SCENE_ID, MAX_SCENES, MAX_SCENE_NAME, sceneNamesOf, type CommandInput, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

interface Props { state: RoomState; connection: RoomConnection }

function useSceneCommand(connection: RoomConnection) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (command: CommandInput) => {
    setBusy(true);
    setError(null);
    try {
      const result = await connection.command(command);
      if (!result.ok) setError(result.message);
      return result.ok;
    } catch {
      setError("Could not change scenes. Check your connection and try again.");
      return false;
    } finally { setBusy(false); }
  };
  return { busy, error, run };
}

/** Always within reach of the GM, even with the Manage panel closed. */
export function SceneSwitcher({ state, connection }: Props) {
  const { busy, error, run } = useSceneCommand(connection);
  return <div className="scene-switcher">
    <select aria-label="Active scene" title="Switch scenes; progress saves automatically" disabled={busy}
      value={state.activeSceneId ?? INITIAL_SCENE_ID}
      onChange={(event) => { void run({ type: "scene.switch", sceneId: event.target.value }); }}>
      {Object.entries(sceneNamesOf(state)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
    {error && <span className="error" role="alert">{error}</span>}
  </div>;
}

/** Live locations complement reusable templates and recovery checkpoints (ADR 0045). */
export function ScenesPanel({ state, connection }: Props) {
  const { busy, error, run } = useSceneCommand(connection);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const names = sceneNamesOf(state);
  const active = state.activeSceneId ?? INITIAL_SCENE_ID;
  const full = Object.keys(names).length >= MAX_SCENES;
  return <PanelSection id="scenes" title="Scenes">
    <p className="small-print">Progress saves automatically when you switch. Each scene keeps its own tokens, fog and turn order.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <ul className="plain scene-list">
      {Object.entries(names).map(([id, sceneName]) => <li key={id} className="scene-row">
        <button type="button" className="secondary scene-name" disabled={busy || id === active}
          aria-label={`Switch to ${sceneName}`} aria-current={id === active ? "true" : undefined}
          onClick={() => { void run({ type: "scene.switch", sceneId: id }); }}>
          {sceneName}{id === active && <span className="muted"> · Active</span>}
        </button>
        <button type="button" className="small secondary" aria-label={`Rename ${sceneName}`} disabled={busy}
          onClick={() => { setDraft(sceneName); setEditing(id); }}>Rename</button>
        <button type="button" className="small secondary" aria-label={`Delete ${sceneName}`} disabled={busy || id === active}
          onClick={() => setDeleting(id)}>Delete</button>
      </li>)}
    </ul>
    <form className="scene-create" onSubmit={(event) => {
      event.preventDefault();
      if (name.trim() && !busy && !full) void run({ type: "scene.create", name: name.trim() }).then((ok) => { if (ok) setName(""); });
    }}>
      <label>New scene name<input value={name} maxLength={MAX_SCENE_NAME} placeholder="Scene name" disabled={busy || full}
        onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" disabled={busy || full || !name.trim()}>Create scene</button>
    </form>
    <p className="small-print">A new scene starts empty. Add a map or apply an encounter template below. {full && `This room has reached its ${MAX_SCENES}-scene limit.`}</p>
    <Modal open={editing !== null} title="Rename scene" onClose={() => { if (!busy) setEditing(null); }}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (editing && draft.trim() && !busy) void run({ type: "scene.rename", sceneId: editing, name: draft.trim() }).then((ok) => { if (ok) setEditing(null); });
      }}>
        <label>Scene name<input value={draft} maxLength={MAX_SCENE_NAME} onChange={(event) => setDraft(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !draft.trim()}>Save name</button>
      </form>
    </Modal>
    <Modal open={deleting !== null} title="Delete scene" onClose={() => { if (!busy) setDeleting(null); }}>
      <p>Delete “{deleting ? names[deleting] : ""}” and its saved board? Other scenes, checkpoints and encounter templates will remain.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">
        <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => {
          if (deleting) void run({ type: "scene.delete", sceneId: deleting }).then((ok) => { if (ok) setDeleting(null); });
        }}>Delete scene</button>
      </div>
    </Modal>
  </PanelSection>;
}
