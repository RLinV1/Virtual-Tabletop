import { can, conditionSpec, presetOf, type Participant, type RoomState, type Token } from "@vtt/shared";

/**
 * The details card for the token selected on the board, with Edit and Duplicate (token-card-actions).
 * Plain React: it never touches Pixi objects, so it can be tested on its own.
 */
export function TokenCard({
  token,
  state,
  you,
  readOnly = false,
  onClose,
  onEdit,
  onDuplicate,
}: {
  token: Token;
  state: RoomState;
  you: Participant;
  /** Previewing as a player or replaying: details only, nothing to send. */
  readOnly?: boolean;
  onClose: () => void;
  /** Opens the sidebar's token editor. */
  onEdit?: () => void;
  /** Starts placing copies on the board, once per click. */
  onDuplicate?: () => void;
}) {
  // Same rules the server enforces; these only decide whether to draw the buttons.
  const showEdit = !readOnly && !!onEdit && can.editToken(you, token);
  const showDuplicate = !readOnly && !!onDuplicate && you.role === "gm";

  return (
    <aside className="token-card" aria-label={`${token.name} details`}>
      <div className="token-card-head">
        <span className="token-card-swatch" style={{ background: token.color }} aria-hidden="true" />
        <strong>{token.name}</strong>
        <button type="button" className="secondary" onClick={onClose} aria-label="Close token details">×</button>
      </div>
      <dl>
        <dt>HP</dt>
        <dd>{token.stats.hp === null ? "Not tracked" : token.stats.maxHp === null ? token.stats.hp : `${token.stats.hp} / ${token.stats.maxHp}`}</dd>
        {token.stats.ac !== null && (
          <>
            <dt>AC</dt>
            <dd>{token.stats.ac}</dd>
          </>
        )}
        {presetOf(state).features.conditions && (
          <>
            <dt>Status</dt>
            <dd>{token.conditions.length ? token.conditions.map((c) => conditionSpec(c).label).join(", ") : "None"}</dd>
          </>
        )}
        {you.role === "gm" && (
          <>
            <dt>Owners</dt>
            <dd>
              {token.ownerIds.length
                ? token.ownerIds.map((id) => state.participants[id]?.displayName ?? "Unknown").join(", ")
                : "GM only"}
            </dd>
            <dt>Visible</dt>
            <dd>{token.hidden ? "Hidden from players" : "Everyone"}</dd>
            {token.initiative != null && (
              <>
                <dt>Initiative</dt>
                <dd>{String(token.initiative)}</dd>
              </>
            )}
          </>
        )}
      </dl>
      {(showEdit || showDuplicate) && (
        <div className="row token-card-actions">
          {showEdit && (
            <button type="button" className="secondary" onClick={onEdit} aria-label={`Edit ${token.name}`}>
              Edit
            </button>
          )}
          {showDuplicate && (
            <button type="button" className="secondary" onClick={onDuplicate} aria-label={`Duplicate ${token.name}`}>
              Duplicate
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
