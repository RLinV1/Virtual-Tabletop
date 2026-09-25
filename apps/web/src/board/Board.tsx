import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { BoardView } from "./boardView";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  /** Plain React controls shown top left, before Fit (e.g. the participants button). */
  toolbar?: ReactNode;
  /** Notices pinned to the top right of the board, e.g. the GM's "Sam left the table". */
  notices?: ReactNode;
}

/** What the roster and initiative list can ask the canvas to do (FR-GM-24). */
export interface BoardHandle {
  focusToken(tokenId: string): void;
}

export const Board = forwardRef<BoardHandle, Props>(function Board({ connection, state, you, toolbar, notices }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const latest = useRef({ state, you });
  latest.current = { state, you };

  useEffect(() => {
    const view = new BoardView(hostRef.current!, {
      moveToken: async (tokenId, to) => {
        const result = await connection.command({ type: "token.move", tokenId, to });
        if (!result.ok) console.warn("Move rejected:", result.message);
        return result.ok;
      },
      dragPreview: (tokenId, at) => connection.ephemeral({ type: "tokenDragPreview", tokenId, at }),
      ping: (at) => connection.ephemeral({ type: "ping", at }),
    });

    let disposed = false;
    view.init().then(() => {
      if (disposed) return view.destroy();
      viewRef.current = view;
      view.update(latest.current.state, latest.current.you);
    });
    const stopEphemeral = connection.onEphemeral((_from, payload) => {
      if (payload.type === "ping") view.showPing(payload.at, 0x3498db);
      else if (payload.type === "tokenDragPreview") view.showDragPreview(payload.tokenId, payload.at);
    });

    return () => {
      disposed = true;
      stopEphemeral();
      if (viewRef.current === view) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, [connection]);

  useEffect(() => {
    viewRef.current?.update(state, you);
  }, [state, you]);

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
  }), []);

  return (
    <div className="board" data-tour="board">
      <div ref={hostRef} className="board-canvas" />
      <div className="board-toolbar">
        {toolbar}
        <button type="button" className="tool-button" data-tour="fit" onClick={() => viewRef.current?.resetView()} title="Fit the map to the screen">
          Fit
        </button>
      </div>
      {notices}
      <p className="board-hint">Drag to pan · scroll to zoom · double-click to ping · hold Alt to place freely</p>
    </div>
  );
});
