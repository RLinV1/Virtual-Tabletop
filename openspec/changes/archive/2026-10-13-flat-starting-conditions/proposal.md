# Proposal

## Why

Add Token and the creature form both put the starting conditions in a collapsible "Starting conditions" section inside their already collapsible "Advanced settings" section. Having a section inside a section is an extra click and doesn't help: once the GM has opened Advanced settings, the conditions should just be there.

## What Changes

- In Add Token (in a room) and in the creature form (New creature, Edit creature, Save as creature), the conditions picker sits directly inside Advanced settings under a plain "Starting conditions" label. It opens and closes with Advanced settings, and the nested collapsible section is removed.
- The label no longer lists the chosen conditions. The picker's own checked chips show them, and they're visible whenever Advanced settings is open.
- Add Token keeps everything else: conditions only appear when the room's game turns them on, and Advanced settings still starts closed.
- The creature form keeps everything else, including Advanced settings opening on its own when the form starts with conditions or a Starting HP.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `library-creatures`: "Creature form advanced settings" no longer describes the conditions as a nested section.

No spec describes Add Token's Advanced settings layout, so its side of the change has no spec delta.

## Impact

- `apps/web/src/panels/AddToken.tsx`, `apps/web/src/pages/LibraryCreatures.tsx`.
- Tests: `apps/web/test/creatureFormAdvanced.test.tsx` (it reads the nested section's title), plus a new Add Token test.
- No CSS changes: `add-token-conditions` has no styles. No change to `packages/shared`, the server, or what either form sends or saves.
