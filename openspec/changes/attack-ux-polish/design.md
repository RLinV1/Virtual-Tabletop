## Context

See proposal.md for the why. Everything here is in `apps/web`; the shared contract, server and ADRs don't change.
- **`AttackPanel.tsx`** renders, top to bottom:
  - the attacker `<select>`, and the target row with its list;
  - saved-attack chips;
  - the To hit / Damage toggle, the dice builder, label and 🔖;
  - the GM-only checkbox and Roll;
  - `LatestAttack` (dice tray, result, Waiting, Roll damage).

  `AttackForm` is keyed by attacker id, so changing attacker resets its local state.
- **The attacker** is `pick.attackerId ?? activeTurnToken ?? first`, and `pick` lives in `RoomPage`. Once set, `pick.attackerId` never follows the turn again. That is the GM bug.
- **Browser storage** (`usePersistentState`, validated on read):
  - `vtt.attack.last`: `tokenId → { count, sides, modifier, label, kind? }`;
  - `vtt.attack.saved`: `tokenId → SavedAttack[]`, at most 8.
- **`RulingsPanel`** is rendered only in the Play tab. `pendingRulings(state)` in `attackRoll.ts` derives its rows.
- **Tabs.** `PanelTabs` in `RoomPanel.tsx` renders the tabs; the top bar keeps it visible even with the sidebar collapsed. `RoomPage` owns `tab`.
- **Initiative controls.** `InitiativeTracker` renders Next turn / End encounter for the GM.

## Goals / Non-Goals

**Goals:**
- The common path (target → named attack → wait → Roll damage) takes the fewest taps and the least scrolling, and its result is always in view.
- The GM never rolls as a stale attacker, and never misses waiting rulings.
- No shared-contract change, and existing browser data carries over.

**Non-Goals:**
- Changing what the server accepts, or who may rule.
- Grouping targets by side, and multi-target damage.

## Decisions

### 1. The attacker follows the turn, driven by a turn change, not by render
- `AttackPanel` keeps the last active-turn token id it saw, in a ref.
- When the active-turn token changes to one the viewer controls, it calls `onPick({ attackerId: thatId, targetId })`. The target is dropped if it is now the attacker.
- A manual choice after that sticks until the next turn change.
- **Alternative: always derive the attacker from the turn when there is one.** It would stop a player from attacking out of turn with a different token, and the spec allows that. Rejected.
- **Alternative: clear `pick.attackerId` on every turn change.** Only right when the new active token is controlled by the viewer. A player's pick shouldn't reset on a monster's turn. Rejected.

### 2. The outcome card goes first; the attacker is text when there's one token
- New order:
  1. attacker line (text or `<select>`);
  2. **outcome card** (the current `LatestAttack`, moved);
  3. target row and list;
  4. the GM-only checkbox and the hidden-token warning;
  5. named attacks;
  6. **Custom roll** (collapsed).
- The GM-only checkbox sits *above* the named attacks, outside the collapsed builder, because a tap rolls at once. Privacy has to be decided, and the hidden-token warning seen, before tapping.
- The GM-only setting lives in `RoomPage`, like `attackPick`, so leaving the Play tab doesn't reset it to public.
- Roll damage sends with the to-hit roll's own visibility, so a private attack never gets a public follow-up. The fallback to Custom roll switches the setting to GM-only for a GM-only roll.
- A ping is sent only once the local view has caught up to the roll's seq from the ack. While a resync is pending, the view can lag behind, and a stale view might show a now-hidden target as visible.
- **Custom roll** is a `<details>` element: native disclosure, keyboard-accessible, no JS. Its open state is kept in `vtt.ui.customRoll` through `usePersistentState`.
- The dice tray in the card stays. It is the result's feedback, and it already stops animating once the dice land.

### 3. Named attacks replace saved attacks
- **Type:** `AttackPreset = { name, toHit: AttackDice | null, damage: AttackDice | null }`, with at least one of the two set. Stored in `vtt.attack.presets` as `tokenId → AttackPreset[]`, at most 8 per token.
- **Migration on read:**
  - `readPresets()` merges any `vtt.attack.saved` entry for a token that has no named attacks yet: `toHit` saved → `{ toHit }`, `damage` saved → `{ damage }`, name = saved name, or the expression if unnamed.
  - The migrated list is written to `vtt.attack.presets` the first time named attacks change.
  - `vtt.attack.saved` is left in place, so rolling back the build loses nothing.
  - A pure `migrateSaved(saved)` in `attackRoll.ts` is unit-tested.
- **Attack row:**
  - A primary button: **⚔ Longsword**, with small text "+5 · 1d8+3". To-hit is shown as its modifier when the dice are `1d20`, and as the full expression otherwise.
  - An ✎ edit button.
- **Tapping a named attack:**
  - with a to-hit roll → roll it as `toHit`, labeled with the named attack's name;
  - damage-only → roll it as `damage`, labeled "`<name>` damage".
  - Labels are truncated to 40 characters.
- **Inline editor:** name; To hit (die `<select>`, count, modifier; a checkbox to include it); Damage (the same); Save, Remove and Cancel. A `<select>` for the die rather than 7 chips keeps the editor compact.
- **Default when adding:** To hit `1d20+0` on, Damage `1d6+0` on, no name.
- **Linking a roll back to its named attack:** `presetForRoll(presets, roll)` finds the named attack whose name equals the roll's label (to-hit rolls) for the roll's attacker. It returns null for custom rolls, renamed attacks and so on, and then **Roll damage** falls back to opening Custom roll set to Damage.
  - **Alternative: store a named attack id on the roll.** That would change the shared schema for a client-only convenience. Rejected.
  - The cost of matching by name: renaming a named attack between the to-hit and the damage roll breaks the one-tap follow-up, and it falls back gracefully.

### 4. Pending indicators
- **GM count.** `PanelTabs` gets an optional `badges: Partial<Record<TabId, ReactNode>>`. `RoomPage` passes `{ play: pendingRulings(state).length || null }` for the GM. It renders as a small pill after the tab label, with an accessible name like "Play, 2 rulings pending".
- **Player dot.**
  - `RoomPage` keeps `seenOutcome: string | null`, the outcome key (`rollId:verdict:applied`) of the player's latest attack roll as of the last time Play was showing.
  - When `tab !== "play"` and the current key differs from `seenOutcome`, and the roll has a verdict or is applied, `badges.play` is a dot with the accessible name "Play, new ruling".
  - Opening Play updates `seenOutcome`.
  - This lives only in memory; a reload clears it.
- **Next turn note.** `InitiativeTracker` (GM only) renders "`N` rulings pending" beside Next turn when `pendingRulings(state).length > 0`, as muted text rather than a warning or a block.
- **Alternative: toast notifications.** Too much noise for a room that already animates dice and pings. Rejected.

### 5. The GM rules inline
- `LatestAttack` gets an optional `onRule` and `onApply`, passed only for the GM.
- On the GM's own latest roll it shows the same Hit/Miss or Apply −N controls as `RulingsPanel`, sending the same commands.
- A shared small component, `RulingButtons`, used by both, keeps the two identical.

### 6. Larger GM targets
Hit, Miss and Apply stop being `.chip` and become regular `button` / `button.secondary`, at least 36px tall. On phones the Rulings rows wrap onto two lines.

### 7. Quiet outside combat, never disabled
- Attacks outside an encounter are ordinary at the table: surprise attacks, traps, objects, and tables that don't use the tracker. So nothing is disabled. The section collapses instead, which removes the noise without removing the feature.
- **`SectionCollapseProvider`** gains:
  - `setCollapsed(id, value)`, for automatic changes;
  - `hasChoice(id)`: whether this browser has a stored value;
  - `toggledSince(id)`: whether the user toggled it since the last automatic change, kept in memory.
- **The logic** lives in a pure `attackSectionChange(previous, next, toggledThisEncounter)` in `attackRoll.ts`, unit-tested. Inputs are `{ inEncounter, yourTurn }`. It returns `"open"`, `"collapse"` or `null`:
  - an encounter starting → open;
  - an encounter ending → collapse;
  - `yourTurn` going false → true during an encounter, with no manual toggle since it started → open.
- **Where it runs:** a hook in `RoomPanel`, which stays mounted when the sidebar tab changes. It compares with the previous values in a ref.
- **First observation:** collapse only if there's no stored choice and no encounter.
- **For the GM,** who controls every token, `yourTurn` stays true for the whole encounter, so the section opens at the encounter's start and is then left alone.
- **Heading:** "Attack · no encounter running" while there's no encounter, so the collapsed line says why it is quiet.
- **Alternative: disable the section with no encounter.** It blocks surprise attacks and traps, and ties attacks to an optional tracker. Rejected (see proposal discussion).
- **Alternative: a server-enforced room setting.** A separate, later change (schema + ADR), and players only.

## Risks / Trade-offs

- **[A tap rolls at once, so a mis-tap rolls]** → Named attacks are unavailable until a target is chosen. The result card shows the roll immediately, and the GM ignores stray rolls as at a physical table. Rolls can't be undone, same as today.
- **[Following the turn can override a deliberate pick]** → Only on a turn change to a token the viewer controls, which is almost always what they want. They can choose again after.
- **[Matching named attacks by name]** → The one-tap damage follow-up needs the named attack's name to still match the roll's label; otherwise it falls back to Custom roll. No wrong damage is ever rolled.
- **[Two storage keys during migration]** → `vtt.attack.saved` is read-only after this change and never deleted, so data is never lost; it is just ignored once named attacks exist for that token.
- **[The player dot doesn't survive a reload]** → Acceptable: after a reload the outcome card at the top of Play shows the current outcome anyway.
