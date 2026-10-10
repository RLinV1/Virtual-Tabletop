import { useState } from "react";
import { MAX_GROUP_NAME, type Token, type TokenGroup } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

/**
 * A group's heading in the GM's roster (KAN-82): its name and size, and Rename, Delete, Hide all
 * and Show all. Hide and Show send one visibility change per token (FR-GM-16), only for the tokens
 * that need it. Deleting a group never deletes its tokens.
 */
export function GroupHeading({ group, tokens, connection, onError, collapsed, onToggle }: {
  group: TokenGroup;
  tokens: readonly Token[];
  connection: RoomConnection;
  onError: (message: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const r = await connection.command(command);
    onError(r.ok ? null : r.message);
    return r.ok;
  };
  const setHidden = async (hidden: boolean) => {
    setBusy(true);
    try {
      for (const token of tokens) {
        if (token.hidden === hidden) continue;
        if (!(await send({ type: "token.setHidden", tokenId: token.id, hidden }))) break;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-heading">
      <CollapseToggle label={group.name} count={tokens.length} collapsed={collapsed} onToggle={onToggle} />
      <span className="group-actions">
        <button type="button" className="link small" disabled={busy || tokens.every((t) => t.hidden)} onClick={() => void setHidden(true)}
          aria-label={`Hide all of ${group.name}`}>Hide all</button>
        <button type="button" className="link small" disabled={busy || tokens.every((t) => !t.hidden)} onClick={() => void setHidden(false)}
          aria-label={`Show all of ${group.name}`}>Show all</button>
        <button type="button" className="link small" onClick={() => { setName(group.name); setRenaming(true); }}
          aria-label={`Rename ${group.name}`}>Rename</button>
        <button type="button" className="link small danger" onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete group ${group.name}`}>Delete</button>
      </span>

      <Modal open={renaming} title={`Rename ${group.name}`} onClose={() => setRenaming(false)}>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          if (await send({ type: "group.rename", groupId: group.id, name })) setRenaming(false);
        }}>
          <label>Group name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={MAX_GROUP_NAME} autoFocus /></label>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setRenaming(false)}>Cancel</button>
            <button type="submit">Rename</button>
          </div>
        </form>
      </Modal>
      <Modal open={confirmingDelete} title={`Delete ${group.name}?`} onClose={() => setConfirmingDelete(false)}>
        <div className="stack">
          <p>The group goes; its {tokens.length} {tokens.length === 1 ? "token stays" : "tokens stay"} on the board, ungrouped.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)} autoFocus>Keep</button>
            <button type="button" className="danger-fill" onClick={async () => {
              if (await send({ type: "group.delete", groupId: group.id })) setConfirmingDelete(false);
            }}>Delete group</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** "New group" for the GM's roster (KAN-82). */
export function NewGroupForm({ connection, onError }: { connection: RoomConnection; onError: (message: string | null) => void }) {
  const [name, setName] = useState("");
  return (
    <form className="row new-group" onSubmit={async (e) => {
      e.preventDefault();
      const r = await connection.command({ type: "group.create", name });
      onError(r.ok ? null : r.message);
      if (r.ok) setName("");
    }}>
      <label htmlFor="new-group-name" className="sr-only">New group name</label>
      <input id="new-group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Gate guards"
        maxLength={MAX_GROUP_NAME} required autoComplete="off" />
      <button type="submit" className="secondary">Add group</button>
    </form>
  );
}

/** The group's name and size; toggles whether its tokens are listed. */
export function CollapseToggle({ label, count, collapsed, onToggle }: { label: string; count: number; collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="group-toggle" aria-expanded={!collapsed} onClick={onToggle}>
      <span aria-hidden="true" className="group-caret">{collapsed ? "▸" : "▾"}</span>
      <span className="group-name">{label}</span>
      <span className="muted">{count} {count === 1 ? "token" : "tokens"}</span>
    </button>
  );
}
