import type { CommandResult, RoomConnection } from "./roomConnection";

/**
 * A read-only view of a connection, for the GM previewing the room as a player (gm-view-as-player).
 * Everything reads through to the real connection, but nothing is sent: commands are refused
 * locally and ephemeral messages (pings, drag previews) are dropped, so no command or relay ever
 * goes out in the previewed player's name or the GM's while looking through their eyes.
 */
export function previewConnection(connection: RoomConnection, name: string): RoomConnection {
  const refused = async (): Promise<CommandResult> => ({ ok: false, code: "forbidden", message: `Previewing as ${name}. Go back to the GM view to make changes.` });
  return new Proxy(connection, {
    get(target, prop) {
      if (prop === "command") return refused;
      if (prop === "ephemeral" || prop === "preview" || prop === "endPreview") return () => {};
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
