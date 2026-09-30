/**
 * Where the Dice panel's latest roll is in its throw (FR-TAC-09, throw-dice-on-board): landed,
 * in the air in the tray, in the air on this viewer's board, or held while a board throw
 * waits to learn which roll it made. The total is shown only once the roll has landed.
 *
 * Rolls already on the table when the panel mounts have landed, so nothing is replayed.
 */
export interface Landing {
  /** The latest roll known to be at rest. */
  landed: string | undefined;
  /** It came to rest from a throw watched here, not from being on the table already. */
  thrown: boolean;
  /**
   * A die was thrown onto the board and its roll isn't known yet; `after` is the roll that was
   * latest when it left the hand. Only rolls newer than that are held.
   */
  awaiting: { after: string | undefined } | null;
  /** The roll whose dice are in the air on this viewer's board. */
  board: string | null;
}

export type Phase = "landed" | "held" | "board" | "tray";

export type LandingAction =
  /** The die left the hand over the board; its roll is on the way. */
  | { type: "await"; latestId: string | undefined }
  /** The board throw's roll is known (or can't be, null) and plays on the board or not. */
  | { type: "matched"; rollId: string | null; onBoard: boolean; latestId: string | undefined }
  /** The throw's roll wasn't made: rejected, or no answer in time. */
  | { type: "failed" }
  /** A roll's dice came to rest, in the tray or on the board. */
  | { type: "landed"; rollId: string; latestId: string | undefined };

export function initialLanding(latestId: string | undefined): Landing {
  return { landed: latestId, thrown: false, awaiting: null, board: null };
}

/** What the latest roll is doing. */
export function landingPhase(s: Landing, latestId: string | undefined): Phase {
  if (latestId === undefined || latestId === s.landed) return "landed";
  if (latestId === s.board) return "board";
  if (s.awaiting && latestId !== s.awaiting.after) return "held";
  return "tray";
}

export function landingReducer(s: Landing, action: LandingAction): Landing {
  switch (action.type) {
    case "await":
      return { ...s, awaiting: { after: action.latestId } };
    case "failed":
      return { ...s, awaiting: null };
    case "matched":
      if (action.rollId && action.onBoard) return { ...s, awaiting: null, board: action.rollId };
      // Not thrown on the board (reduced motion, no board) or not told apart (a resync in
      // between): the roll is shown at rest, with its result, at once.
      return { ...s, awaiting: null, landed: action.rollId ?? action.latestId, thrown: false };
    case "landed": {
      const board = s.board === action.rollId ? null : s.board;
      // An older roll landing on the board must not take the place of a newer latest roll.
      if (action.rollId !== action.latestId) return { ...s, board };
      return { ...s, board, landed: action.rollId, thrown: true };
    }
  }
}
