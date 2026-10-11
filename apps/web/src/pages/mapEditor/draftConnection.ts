import type { CommandInput, DetectedWall } from "@vtt/shared";
import type { CommandResult, RoomConnection } from "../../net/roomConnection";
import { applyToDraft, DRAFT_ID, withDetectedWalls, type MapDraft } from "./mapDraft";

/** The commands the draft holds; `applyToDraft` handles each. */
const DRAFT_COMMANDS = new Set<CommandInput["type"]>(["wall.add", "wall.remove", "wall.clear", "fog.add", "fog.remove"]);

/**
 * The room connection as the map editor's Walls and Fog steps see it (map-editor-drafts): wall and
 * fog commands change the draft instead of the room, and everything else, such as wall-detection
 * notices, goes to the real connection. The steps don't need to know they are editing a draft.
 */
export function draftConnection(
  connection: RoomConnection,
  update: (change: (draft: MapDraft) => MapDraft) => void,
  /** The finished detection's walls for a map, fetched with the GM's credential. */
  detectedWalls: (mapUrl: string) => Promise<readonly DetectedWall[]>,
): RoomConnection {
  let next = 0;
  const newId = () => `${DRAFT_ID}${Date.now().toString(36)}-${++next}`;
  const ok: CommandResult = { ok: true, seq: null };

  const command = async (input: CommandInput): Promise<CommandResult> => {
    if (input.type === "wall.applyDetected") {
      try {
        const walls = await detectedWalls(input.mapUrl);
        update((draft) => withDetectedWalls(draft, walls, newId));
        return ok;
      } catch (err) {
        return { ok: false, code: "invalid", message: err instanceof Error ? err.message : "Couldn't load the detected walls." };
      }
    }
    if (!DRAFT_COMMANDS.has(input.type)) return connection.command(input);
    update((draft) => applyToDraft(draft, input, newId) ?? draft);
    return ok;
  };

  return new Proxy(connection, {
    get(target, prop) {
      if (prop === "command") return command;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
