import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { GmPanel } from "../pages/GmPanel";
import { DicePanel } from "./DicePanel";
import { InitiativeTracker } from "./InitiativeTracker";
import { MyTokens } from "./MyTokens";
import { TokenRoster } from "./TokenRoster";

/**
 * The room's side panel, composed per role (FR-PL-03).
 *
 * Ordered by what the viewer acts on most: their own tokens, then the turn they are
 * waiting for, then the roster, then dice. GM administration comes last because it is
 * setup, not play.
 *
 * Composition is by ownership and role, never by hiding: a player is not sent GM data and
 * then told not to look at it. The administration controls simply are not rendered, and
 * the server would refuse the commands anyway (FR-GM-15).
 */
export function RoomPanel({
  connection,
  state,
  you,
  inviteCode,
  token,
  onFocusToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  inviteCode?: string;
  token: string;
  onFocusToken: (tokenId: string) => void;
}) {
  return (
    <>
      <MyTokens connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
      <InitiativeTracker connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
      <TokenRoster connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
      <DicePanel connection={connection} state={state} isGm={you.role === "gm"} />
      {you.role === "gm" && (
        <GmPanel connection={connection} state={state} inviteCode={inviteCode} token={token} />
      )}
    </>
  );
}
