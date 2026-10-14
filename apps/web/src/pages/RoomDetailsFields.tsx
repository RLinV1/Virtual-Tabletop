import { DEFAULT_PRESET_ID, GAME_PRESETS, type GamePresetId } from "@vtt/shared";
import { api } from "../net/api";
import { newGuestToken, saveCredentials } from "../net/identity";

/** What creating a room asks for (FR-GM-01, KAN-63). */
export interface RoomDetails {
  roomName: string;
  displayName: string;
  preset: GamePresetId;
}

export const emptyRoomDetails = (roomName = ""): RoomDetails => ({ roomName, displayName: "", preset: DEFAULT_PRESET_ID });

/** True when the details can be sent: a room name and a display name that aren't blank. */
export const roomDetailsReady = (details: RoomDetails) => details.roomName.trim() !== "" && details.displayName.trim() !== "";

/**
 * The room name, the GM's name in the room and the game, as the dashboard's Create a room and
 * an encounter's Open in a room both ask them (ADR 0033).
 */
export function RoomDetailsFields({ value, onChange, disabled = false }: {
  value: RoomDetails;
  onChange: (next: RoomDetails) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        Room name
        <input
          value={value.roomName}
          onChange={(e) => onChange({ ...value, roomName: e.target.value })}
          required
          maxLength={80}
          placeholder="The Broken Span"
          disabled={disabled}
        />
      </label>
      <label>
        Your name
        <input
          value={value.displayName}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
          required
          maxLength={40}
          placeholder="Your name"
          disabled={disabled}
        />
      </label>
      {/* Only a choice once there is more than one game (KAN-63). */}
      {GAME_PRESETS.length > 1 && <fieldset className="preset-choice" disabled={disabled}>
        <legend>Game</legend>
        {GAME_PRESETS.map((p) => (
          <label key={p.id} className="preset-option">
            <input type="radio" name="preset" value={p.id} checked={value.preset === p.id} onChange={() => onChange({ ...value, preset: p.id })} />
            <span>
              <strong>{p.name}</strong>
              <span className="muted small-print">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>}
    </>
  );
}

/** Creates a room as the signed-in GM and keeps its credential on this browser; returns its id. */
export async function createRoomWith(details: RoomDetails, templateId?: string): Promise<string> {
  const guestToken = newGuestToken();
  const created = await api.createRoom({ ...details, guestToken, ...(templateId && { templateId }) });
  saveCredentials({ ...created, guestToken, viaAccount: true });
  return created.roomId;
}
