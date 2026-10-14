import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../src/ui/ToolRail";
import type { BoardTool } from "../src/board/tools";

const render = (isGm: boolean, active: BoardTool["kind"] = "select", options: ToolOptions = DEFAULT_TOOL_OPTIONS) =>
  renderToStaticMarkup(
    <ToolRail active={active} options={options} unitLabel="ft" isGm={isGm} onSelect={() => {}} onOptions={() => {}} onClear={() => {}} />,
  );

describe("board Fog tool on the tool rail (FR-GM-17)", () => {
  it("keeps Fog off the rail for the GM and for players", () => {
    expect(render(true)).not.toContain('title="Fog"');
    expect(render(false)).not.toContain('title="Fog"');
  });

  it("starts in Rectangle mode and keeps the chosen mode", () => {
    expect(toolFor("fog", DEFAULT_TOOL_OPTIONS)).toEqual({ kind: "fog", mode: "rect" });
    expect(toolFor("fog", { ...DEFAULT_TOOL_OPTIONS, fog: { mode: "reveal" } })).toEqual({ kind: "fog", mode: "reveal" });
  });
});
