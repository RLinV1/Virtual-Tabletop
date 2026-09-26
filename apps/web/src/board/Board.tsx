import { CornersOut } from "@phosphor-icons/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../ui/ToolRail";
import { BoardView } from "./boardView";
import type { BoardTool } from "./tools";

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

const HINTS: Record<BoardTool["kind"], string> = {
  select: "Drag to pan · scroll to zoom · double-click to ping · hold Alt to place freely",
  measure: "Drag to measure · hold Alt to measure freely · Esc to stop",
  draw: "Drag to draw · only you can see drawings · Esc to stop",
  area: "Drag to size and aim · click to place the chosen size · hold Alt to place freely · everyone at the table sees areas",
  erase: "Click or drag over your marks and areas to erase them · Esc to stop",
};

/** Keys typed into a field belong to that field, not to the board. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** The PixiJS board plus its React toolbar and notices; Pixi objects stay inside `BoardView`. */
export const Board = forwardRef<BoardHandle, Props>(function Board({ connection, state, you, toolbar, notices }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const latest = useRef({ state, you });
  latest.current = { state, you };
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    const view = new BoardView(hostRef.current!, {
      moveToken: async (tokenId, to) => {
        const result = await connection.command({ type: "token.move", tokenId, to });
        if (!result.ok) console.warn("Move rejected:", result.message);
        return result.ok;
      },
      dragPreview: (tokenId, at) => connection.ephemeral({ type: "tokenDragPreview", tokenId, at }),
      ping: (at) => connection.ephemeral({ type: "ping", at }),
      placeTemplate: async (template) => {
        const result = await connection.command({ type: "template.place", ...template });
        if (!result.ok) console.warn("Area rejected:", result.message);
        return result.ok;
      },
      removeTemplate: (templateId) => {
        void connection.command({ type: "template.remove", templateId }).then((result) => {
          if (!result.ok) console.warn("Area removal rejected:", result.message);
        });
      },
    });

    let disposed = false;
    view.init().then(() => {
      if (disposed) return view.destroy();
      viewRef.current = view;
      view.update(latest.current.state, latest.current.you);
      view.setTool(toolRef.current);
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

  useEffect(() => {
    viewRef.current?.setTool(tool);
  }, [tool]);

  // Escape puts the board back to Select, unless it is meant for a field or an open dialog.
  useEffect(() => {
    if (tool.kind === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      setTool({ kind: "select" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
  }), []);

  return (
    <div className="board" data-tour="board">
      <div ref={hostRef} className="board-canvas" />
      <div className="board-toolbar">
        {toolbar}
        <button type="button" className="tool-button" data-tour="fit" onClick={() => viewRef.current?.resetView()} title="Fit the map to the screen">
          <CornersOut size={16} aria-hidden="true" />
          Fit
        </button>
      </div>
      <ToolRail
        active={tool.kind}
        options={toolOptions}
        unitLabel={state.scene.grid.unitLabel}
        isGm={you.role === "gm"}
        onSelect={(kind) => setTool(toolFor(kind, toolOptions))}
        onOptions={(options) => {
          setToolOptions(options);
          setTool((current) => toolFor(current.kind, options));
        }}
        onClear={() => viewRef.current?.clearMarks()}
      />
      {notices}
      <p className="board-hint">{HINTS[tool.kind]}</p>
    </div>
  );
});
