## Decisions

- **Reuse events.** `FogRemoved` and `FogAdded` already carry the full region (invariant 6) and have inverses. Events from one command share a command id, so history and undo already treat them as one action. A new event type would only duplicate them.
- **Cap check on the net count.** `fog.replace` checks `current - removed + added <= MAX_FOG_REGIONS` before emitting anything.
- **Order in Save.** Fog goes last. Walls and portals are GM-only, so no player sees an intermediate state; the fog swap reaches players as one batch.
- **Undo cap check.** `undoConflict` counts fog after the undo (today's, minus those the action added that are still there, plus those it removed) instead of refusing whenever the room is full.
