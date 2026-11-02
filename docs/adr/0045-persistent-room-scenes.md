# ADR 0045 — Persistent room scenes

Status: Proposed for Real-Time Architecture review; implementation authorized by Raymond.

Scene switching is a convenience over the existing checkpoint board model: the outgoing board is saved automatically and a named destination is restored atomically. Checkpoints remain explicit recovery points and encounter templates remain reusable setups. The GM can switch directly from the room header or the Scenes section in Manage.

RoomState keeps the active board in its existing fields. Optional activeSceneId, sceneNames and savedScenes let historical rooms replay unchanged. savedScenes holds only inactive TableState snapshots plus group data; it is not recursively nested RoomState. The first scene management command registers the legacy board as initial / Scene 1. Max 20 scenes, names 1–60 trimmed characters, case-insensitive uniqueness.

SceneCreated and SceneSwitched include the outgoing and incoming snapshots; SceneRenamed and SceneDeleted carry their prior values. All use the ordinary command → decide → append → reduce → filtered broadcast pipeline. No new storage table or schema migration is needed. Inactive maps and token images participate in the room asset reference index.

Scene lists and inactive boards are GM-only. Scene transitions cause player-safe full snapshots, never raw events carrying hidden boards. Active scene IDs are public opaque identifiers so clients can reset local board state even when both scenes use the same map. Temporary encounter editing rooms cannot manage scenes. Scene changes invalidate board undo history; roll rulings remain room-wide. Checkpoint restores and template applications affect only the active board.

Tokens stay in their own scene with their IDs, ownership, HP, conditions and positions. There is no automatic party transfer or cross-scene stat propagation. Revocation and departure remain room-wide and the command pipeline checks active membership before allowing control. Personal drawings and measurements are discarded on switching; shared areas stay in their scene. The GM's header switcher avoids opening a panel for routine scene changes.

Map-editor commands carry an optional expectedSceneId so stale draft batches and asynchronous UVTT applies cannot overwrite another scene, even when two locations share a map. Scene switches remount local board and panel state. Grid-save acknowledgement guards compare captured scene identity without invalidating a successful save merely because its grid event arrived first.
