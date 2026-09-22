import { useEffect, useState, type FormEvent } from "react";
import { snapTokenCenter, type GridSpec, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import type { CommandResult, RoomConnection } from "../net/roomConnection";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  inviteCode?: string;
  token: string;
}

const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

export function GmPanel({ connection, state, inviteCode, token }: Props) {
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
      <GridForm grid={state.scene.grid} onApply={(grid) => run(connection.command({ type: "scene.setGrid", grid }))} />
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
function GridForm({ grid, onApply }: { grid: GridSpec; onApply: (grid: GridSpec) => Promise<boolean> }) {
  const [draft, setDraft] = useState(grid);
  useEffect(() => setDraft(grid), [grid]);

  const field = (key: "cellSize" | "offsetX" | "offsetY" | "unitsPerCell", label: string) => (
    <label>
      {label}
      <input
        type="number"
        step="0.5"
        min={0}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <section>
      <h2>Grid</h2>
      <form
        className="grid-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        {field("cellSize", "Cell size (px)")}
        {field("unitsPerCell", `Per cell (${draft.unitLabel})`)}
        {field("offsetX", "Offset X")}
        {field("offsetY", "Offset Y")}
        <button type="submit">Apply grid</button>
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
