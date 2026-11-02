import { z } from "zod";
import { TableState, TokenGroup, Id, tableOf, type RoomState } from "./state";

export const MAX_SCENES = 20;
export const MAX_SCENE_NAME = 60;
export const INITIAL_SCENE_ID = "initial";
export const SceneName = z.string().trim().min(1).max(MAX_SCENE_NAME);
/** Inactive boards are GM-only. Active board fields remain in RoomState. */
export const SavedScene = z.object({
  table: TableState,
  groups: z.record(Id, TokenGroup),
  tokenGroups: z.record(Id, Id),
});
export type SavedScene = z.infer<typeof SavedScene>;

export function sceneNamesOf(state: RoomState): Record<string, string> {
  return state.sceneNames ?? { [INITIAL_SCENE_ID]: "Scene 1" };
}

export function saveScene(state: RoomState): SavedScene {
  return { table: tableOf(state), groups: state.groups, tokenGroups: state.tokenGroups };
}
