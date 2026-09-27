import { CornersOut } from "@phosphor-icons/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import type { GridSpec, Participant, Point, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../ui/ToolRail";
import { BoardView } from "./boardView";
import type { BoardTool } from "./tools";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  gridPreview: GridSpec | null;
  /** Plain React controls shown top left, before Fit (e.g. the participants button). */
  toolbar?: ReactNode;
  /** Notices pinned to the top right of the board, e.g. the GM's "Sam left the table". */
  notices?: ReactNode;
  /** The viewer clicked the token `attackerId` attacks, in Pick on board (attack-targeting). */
  onPickTarget?: (attackerId: string, targetId: string) => void;
}

/** What the roster and initiative list can ask the canvas to do (FR-GM-24). */
export interface BoardHandle {
  focusToken(tokenId: string): void;
  /** Pick a target on the board for `tokenId` to attack; the pick goes to `onPickTarget` (attack-targeting). */
  startAttack(tokenId: string): void;
  /** Show a ping on this viewer's board only, e.g. the one an attack roll just sent. */
  showPing(at: Point): void;
}

const HINTS: Record<BoardTool["kind"], string> = {
  select: "Drag to pan · scroll to zoom · double-click to ping · hold Alt to place freely",
  measure: "Drag to measure · hold Alt to measure freely · Esc to stop",
  draw: "Drag to draw · only you can see drawings · Esc to stop",
  area: "Drag to size and aim · click to place the chosen size · hold Alt to place freely · everyone at the table sees areas",
  erase: "Click or drag over your marks and areas to erase them · Esc to stop",
  attack: "Click the token to attack · Esc or right-click to cancel",
};

/** With GM only ticked, the areas are the GM's alone; saying "everyone sees them" would mislead. */
const GM_ONLY_AREA_HINT = "Drag to size and aim · click to place the chosen size · GM only: players won't see these areas";

/** Keys typed into a field belong to that field, not to the board. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** The PixiJS board plus its React toolbar and notices; Pixi objects stay inside `BoardView`. */
export const Board = forwardRef<BoardHandle, Props>(function Board({ connection, state, you, gridPreview, toolbar, notices, onPickTarget }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const latest = useRef({ state, you, gridPreview, onPickTarget });
  latest.current = { state, you, gridPreview, onPickTarget };
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  /** The tool to go back to once an attack's target is picked or cancelled. */
  const beforeAttack = useRef<BoardTool>({ kind: "select" });
  const endAttack = () => setTool((current) => (current.kind === "attack" ? beforeAttack.current : current));

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
      removeTemplate: async (templateId) => {
        const result = await connection.command({ type: "template.remove", templateId });
        if (!result.ok) console.warn("Area removal rejected:", result.message);
        return result.ok;
      },
      pickTarget: (attackerId, targetId) => {
        endAttack();
        latest.current.onPickTarget?.(attackerId, targetId);
      },
      cancelAttack: () => endAttack(),
    });

    let disposed = false;
    view.init().then(() => {
      if (disposed) return view.destroy();
      viewRef.current = view;
      view.setGridPreview(latest.current.gridPreview);
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
    viewRef.current?.setGridPreview(gridPreview);
  }, [gridPreview]);

  useEffect(() => {
    viewRef.current?.setTool(tool);
  }, [tool]);

  // Escape puts the board back to Select, unless it is meant for a field or an open dialog.
  // An attack being aimed goes back to whatever tool was in use before it.
  useEffect(() => {
    if (tool.kind === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if (toolRef.current.kind === "attack") endAttack();
      else setTool({ kind: "select" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);

  // The attacker can vanish while its target is being picked: deleted, or hidden from a player.
  const attackerId = tool.kind === "attack" ? tool.attackerId : null;
  const attackerGone = attackerId !== null && !state.tokens[attackerId];
  useEffect(() => {
    if (attackerGone) endAttack();
  }, [attackerGone]);

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
    startAttack: (tokenId: string) => {
      if (toolRef.current.kind !== "attack") beforeAttack.current = toolRef.current;
      setTool({ kind: "attack", attackerId: tokenId });
    },
    showPing: (at: Point) => viewRef.current?.showPing(at),
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
      {gridPreview && <p className="grid-preview-label" role="status">Preview · Not applied</p>}
      <ToolRail
        active={tool.kind}
        options={toolOptions}
        unitLabel={state.scene.grid.unitLabel}
        isGm={you.role === "gm"}
        onSelect={(kind) => setTool(toolFor(kind, toolOptions))}
        onOptions={(options) => {
          setToolOptions(options);
          setTool((current) => (current.kind === "attack" ? current : toolFor(current.kind, options)));
        }}
        onClear={() => viewRef.current?.clearMarks()}
      />
      {notices}
      <p className="board-hint">{tool.kind === "area" && tool.gmOnly ? GM_ONLY_AREA_HINT : HINTS[tool.kind]}</p>
    </div>
  );
});
