import { useState, type FormEvent } from "react";
import { snapTokenCenter, type GridSpec, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { gridsEqual, parseGridDraft, type GridDraft } from "./gridDraft";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  inviteCode?: string;
  token: string;
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridDraftChange: (draft: GridDraft) => void;
  onGridDraftCancel: () => void;
  onGridApply: (grid: GridSpec) => Promise<void>;
  gridApplying: boolean;
  gridError: string | null;
}

const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

export function GmPanel({
  connection, state, inviteCode, token,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const players = Object.values(state.participants).filter((p) => p.role === "player");

  const run = async (p: Promise<CommandResult>) => {
    const result = await p;
    setError(result.ok ? null : result.message);
    return result.ok;
  };

  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      <InviteLink inviteCode={inviteCode} />
      <MapUpload
        token={token}
        onError={setError}
        onUploaded={(map) => run(connection.command({ type: "scene.setMap", map }))}
      />
      <GridForm
        grid={state.scene.grid}
        draft={gridDraft}
        hasDraft={hasGridDraft}
        onChange={onGridDraftChange}
        onCancel={onGridDraftCancel}
        onApply={onGridApply}
        applying={gridApplying}
        error={gridError}
      />
      <AddToken
        players={players}
        onAdd={(name, ownerId, hidden) => {
          const map = state.scene.map;
          const count = Object.keys(state.tokens).length;
          const center = map ? { x: map.width / 2, y: map.height / 2 } : { x: 1050, y: 700 };
          // Fan new tokens out around the centre instead of stacking them all on one cell,
          // which made the roster and turn order useless the moment there was a second one.
          const ring = Math.floor(count / 8) + 1;
          const angle = (count % 8) * (Math.PI / 4);
          const spread = state.scene.grid.cellSize * ring;
          center.x += Math.cos(angle) * spread;
          center.y += Math.sin(angle) * spread;
          return run(
            connection.command({
              type: "token.create",
              name,
              hidden,
              ownerIds: ownerId ? [ownerId] : [],
              color: TOKEN_COLORS[count % TOKEN_COLORS.length],
              position: snapTokenCenter(center, 1, state.scene.grid),
            }),
          );
        }}
      />
      <section>
        <h2>Manage tokens</h2>
        {Object.values(state.tokens).length === 0 && <p className="muted">No tokens yet.</p>}
        <ul className="plain token-list">
          {Object.values(state.tokens).map((t) => (
            <li key={t.id}>
              <span className="swatch" style={{ background: t.color }} aria-hidden />
              <span className="token-name">{t.name}</span>
              <select
                aria-label={`Owner of ${t.name}`}
                value={t.ownerIds[0] ?? ""}
                onChange={(e) =>
                  run(connection.command({ type: "token.setOwners", tokenId: t.id, ownerIds: e.target.value ? [e.target.value] : [] }))
                }
              >
                <option value="">No owner</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={t.hidden}
                  onChange={(e) => run(connection.command({ type: "token.setHidden", tokenId: t.id, hidden: e.target.checked }))}
                />
                Hidden
              </label>
              <button
                className="link danger"
                onClick={() => run(connection.command({ type: "token.delete", tokenId: t.id }))}
                aria-label={`Delete ${t.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function InviteLink({ inviteCode }: { inviteCode?: string }) {
  const [copied, setCopied] = useState(false);
  if (!inviteCode) return null;
  const url = `${location.origin}/join/${inviteCode}`;
  return (
    <section>
      <h2>Invite players</h2>
      <div className="row">
        <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked; the field is selectable */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function MapUpload(props: {
  token: string;
  onUploaded: (map: { url: string; width: number; height: number }) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.upload(file, props.token);
      const { width, height } = await imageSize(url);
      await props.onUploaded({ url, width, height });
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Battle map</h2>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        aria-label="Upload battle map"
        onChange={(e) => onChange(e.target.files?.[0])}
      />
      {busy && <p className="muted">Uploading…</p>}
    </section>
  );
}

function imageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

/** Manual grid correction (FR-GM-04). Automatic detection (FR-GM-03) will prefill these. */
function GridForm({
  grid, draft, hasDraft, onChange, onCancel, onApply, applying, error,
}: {
  grid: GridSpec;
  draft: GridDraft;
  hasDraft: boolean;
  onChange: (draft: GridDraft) => void;
  onCancel: () => void;
  onApply: (grid: GridSpec) => Promise<void>;
  applying: boolean;
  error: string | null;
}) {
  const validDraft = parseGridDraft(draft);

  const nudgedValue = (key: "cellSize" | "offsetX" | "offsetY", delta: number): string | null => {
    if (draft[key].trim() === "") return null;
    const current = Number(draft[key]);
    if (!Number.isFinite(current)) return null;
    if (key === "cellSize") {
      const next = current + delta;
      return next > 0 && next <= 2000 ? String(next) : null;
    }
    const size = Number(draft.cellSize);
    if (draft.cellSize.trim() === "" || !Number.isFinite(size) || size <= 0 || size > 2000) return null;
    return String(((current + delta) % size + size) % size);
  };

  const field = (key: "cellSize" | "offsetX" | "offsetY" | "unitsPerCell", label: string) => (
    <div className="grid-field" key={key}>
      <label>
        {label}
        <input
          type="number"
          step="any"
          min={0}
          max={key === "cellSize" ? 2000 : undefined}
          required
          disabled={applying}
          value={draft[key]}
          onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
        />
      </label>
      {key !== "unitsPerCell" && (
        <div className="grid-nudges" role="group" aria-label={`${label} nudges`}>
          {[-5, -1, 1, 5].map((delta) => {
            const next = nudgedValue(key, delta);
            return (
              <button
                key={delta}
                type="button"
                className="secondary small"
                disabled={applying || next === null}
                aria-label={`${label}: ${delta > 0 ? "increase" : "decrease"} by ${Math.abs(delta)} pixels`}
                onClick={() => { if (next !== null) onChange({ ...draft, [key]: next }); }}
              >
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <section>
      <h2>Grid</h2>
      <form
        className="grid-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (validDraft && !applying && !gridsEqual(validDraft, grid)) void onApply(validDraft);
        }}
      >
        {field("cellSize", "Cell size (px)")}
        {field("unitsPerCell", `Per cell (${draft.unitLabel})`)}
        {field("offsetX", "Offset X (px)")}
        {field("offsetY", "Offset Y (px)")}
        <p className="muted grid-confidence">Confidence: manual</p>
        {hasDraft && !validDraft && (
          <p className="error grid-message" role="alert">
            Preview is paused at the last valid values. Use a cell size above 0 and at most 2000 px, positive units,
            and offsets from 0 up to less than the cell size.
          </p>
        )}
        {error && <p className="error grid-message" role="alert">{error}</p>}
        <div className="grid-actions">
          <button type="button" className="secondary" disabled={!hasDraft || applying} onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={!validDraft || gridsEqual(validDraft, grid) || applying}>
            {applying ? "Applying…" : "Apply grid"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AddToken(props: {
  players: { id: string; displayName: string }[];
  onAdd: (name: string, ownerId: string, hidden: boolean) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);

  return (
    <section>
      <h2>Add token</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await props.onAdd(name, ownerId, hidden)) setName("");
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>
        <label>
          Owner
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">No owner (GM only)</option>
            {props.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hidden from players
        </label>
        <button type="submit">Add token</button>
      </form>
    </section>
  );
}
