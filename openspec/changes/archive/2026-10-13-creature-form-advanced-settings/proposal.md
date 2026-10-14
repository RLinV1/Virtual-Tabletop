# Proposal

## Why

The New creature / Edit creature pop-up shows every field at once: Starting HP, a colour picker, the full condition picker and two hint lines, even though most creatures only need a name, size, Max HP, AC, attacks and art. Add Token in a room already puts its rarely changed fields under "Advanced settings". The creature form should do the same so it is shorter and the two forms look alike.

## What Changes

- Starting HP (with its "Leave Starting HP blank to start at Max HP." hint), Colour without art, and the conditions picker move into an "Advanced settings" section at the bottom of the form, just above Cancel / Create. It looks and works like Add Token's section.
- The conditions picker becomes a nested "Starting conditions" section, as in Add Token. Its title lists the chosen conditions, and it is open whenever any are chosen. This replaces the "Starts with" label.
- Advanced settings opens on its own when the form opens with a Starting HP value or any condition (editing such a creature, or Save as creature from a wounded or affected token), and when the "Starting HP cannot exceed Max HP." error appears. Otherwise it starts closed. It never closes on its own while the GM is using it.
- The stat row becomes Size, Max HP, AC.
- Remove the line "Without art it shows as a colour disc." next to Choose token art.
- Remove the line "Named to-hit and damage rolls are copied to each placed token." under Attacks.
- This applies to every use of the form: New creature, Edit creature, and Save as creature from the token editor.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `library-creatures`: adds a requirement for how the creature form is laid out (what goes under Advanced settings and when it opens).

## Impact

- `apps/web/src/pages/LibraryCreatures.tsx` (`CreatureForm`) only. It reuses the existing `add-token-advanced` / `add-token-conditions` styles.
- Web tests in `apps/web/test`.
- No change to Add Token, `packages/shared`, the server or the creature data. Every value saved is the same as before.
