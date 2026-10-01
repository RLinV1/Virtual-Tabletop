## Why

When the GM ends an encounter, the Attack section keeps showing the last fight: the dice tray and its result ("e → d · d damage · 1d6 = 2 · Applied"), the chosen target, and the custom roll settings. The next encounter starts with stale information that looks current.

Named attacks also roll the moment they are tapped. The GM asked for them to work as a list instead: click an attack to pick it, then roll it on purpose.

## What Changes

- **Encounter end clears the Attack section.** When an encounter ends (`InitiativeEnded`), each viewer's Attack section drops:
  - the latest-roll card (dice tray, result, ruling controls, Roll damage);
  - the chosen target;
  - the custom roll settings remembered per token (`vtt.attack.last`) and any half-set custom roll;
  - the picked named attack and any open named-attack editor.

  Named attacks (`vtt.attack.presets`) and the chosen attacker stay, so the list still shows that token's attacks. The GM's "Roll privately" setting also stays: it is a preference, and resetting it to public could expose a private follow-up roll.
- **Named attacks are picked from a dropdown.** The token's named attacks are the options of one dropdown styled like the app's popovers, each showing name and dice ("Longsword +5 · 1d8+3"), so the section stays one row tall however many attacks a token has. Choosing one does not roll. A **Roll** button under it rolls the selected attack at the target: "Roll Longsword to hit Goblin", or "Roll Burning Hands damage to Goblin" for a damage-only attack. The first attack is selected by default, and a newly added attack becomes the selection. The pencil button beside the dropdown edits the selected attack.

- **Encounter above Attack.** In the Play tab, the Initiative (encounter) section moves above the Attack section: whose turn it is decides who attacks, so it reads first.

**Unchanged:** commands, events, schemas, server rules and visibility rules. The roll history in room state and the dice log are untouched; the card only stops showing the pre-reset roll.

## Capabilities

### Modified Capabilities
- `attack-rolls` (from `attack-ux-polish`, not yet archived): "Named attacks" changes from tap-to-roll to pick-from-a-dropdown then roll, and a new requirement covers clearing on encounter end.

## Impact

- **Order:** archive `attack-ux-polish` before this change, so the MODIFIED requirement has a main spec to apply to.
- **`apps/web`:**
  - `panels/attackSession.ts` (new): `useEncounterReset`, which detects the encounter end in the room page.
  - `panels/attackRoll.ts`: `LAST_USED_KEY`, `latestAttackRoll`.
  - `panels/AttackPicker.tsx` (new): the named-attack dropdown.
  - `panels/AttackPanel.tsx`: the dropdown and Roll button, reset handling.
  - `pages/RoomPage.tsx`, `panels/RoomPanel.tsx`: pass the reset through; Initiative above Attack in Play.
  - `styles.css`.
- **Tests:** `apps/web/test/attackRoll.test.ts`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
