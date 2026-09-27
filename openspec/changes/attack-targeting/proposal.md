## Why

To attack today, a player pings the enemy, types `1d20+5` into the dice panel, and says in voice chat who it was aimed at. Once the ping fades, the roll log reads "Aria rolled 1d20+5: 17" with no attacker, target or weapon, so nobody (including the GM reading history later) can tell what the roll was for. This change adds a guided Attack action on top of existing pieces: target pings (FR-TAC-05), shared dice expressions (FR-TAC-09), and public and GM-only rolls (FR-GM-22). It also makes the roll record what it was for. Deciding hit or miss stays with the GM, as README §7 requires.

## What Changes

- **Attack section in the Play tab**, below My tokens, so everything for an attack is in one place:
  - **Attacker:** a dropdown of the tokens the viewer controls (their own; every token for the GM), preselecting their token whose turn it is.
  - **Target**, chosen either way:
    - **Pick on board** puts the board into targeting mode: a crosshair cursor, a line from the attacker to the hovered token labeled with the grid distance, a click on another visible token to pick it, and `Esc` or right-click to cancel.
    - A **list of visible tokens sorted by distance** ("Goblin 2 · 15 ft"), for quick or keyboard picking.
  - **Dice picker:** die type (d4, d6, d8, d10, d12, d20, d100), count and modifier. It starts from the last settings used with that token in this browser, or `1d20`.
  - **Label**, e.g. "Longsword" (optional), and for the GM a **GM-only** toggle.
  - **Saved attacks:** per-token chips such as "Longsword 1d20+5" or "Damage 1d8+3" that fill in the dice and label in one tap. They are stored in this browser only.
  - **Roll** ("Roll 1d20+5 at Goblin 2") rolls with attack context attached and pings the target (existing ephemeral ping). The 3D dice tray and the result show in the section.
  - **Target lock:** the target stays selected after a roll until cleared with ✕, so a damage roll can follow against the same target.
- The Tokens roster and My tokens rows have no Attack buttons.
- **Roll log.** Rolls with attack context read **"Aria → Goblin 2 · Longsword · 1d20+5 = 17"**, and the GM activity log describes them the same way.
- **Contract change.** `dice.roll` gains an optional `attack: { actorTokenId, targetTokenId, label? }`. `DiceRoll` gains an optional `attack` that stores the token IDs and the token names at the time of the roll. Old events and old clients' commands stay valid. Recorded in ADR 0010 for review by the Real-Time Architecture owner.
- **Server checks** in `decide`, for a roll with attack context:
  - The actor must control the attacking token (owner or GM).
  - Both tokens must exist and be visible to the actor.
  - The target must differ from the attacker.
- **Visibility.** Players never learn the ID or name of a hidden token through an attack roll. This holds when the GM makes a public roll with a hidden token, and when a token is hidden after the roll.
- **Hints, not rules.** Being out of turn or out of range only changes how the UI looks. Neither is blocked.

## Non-goals

- Hit or miss, comparing against AC, and automatic damage (README §7).
- Advantage/disadvantage, or any expression beyond `NdX + M`.
- A GM one-click "apply damage", and a live targeting line other viewers can see (an ephemeral message under FR-SYNC-03). Both are later phases. (Damage rolls themselves are covered: the locked target plus any dice.)
- Syncing saved attacks across devices or with the character's owner; they are a per-browser convenience.
- Attacking several targets at once, or attacking a spot on the map with no token.

## Capabilities

### New Capabilities
- `attack-rolls`: the Attack section, targeting, the dice picker and saved attacks, attack-context rolls, who may make them, and what players may see of them.

### Modified Capabilities
- `room-activity-log`: the "Readable attributed actions" requirement gains an attack-roll description that includes the attacker, target and label.

## Impact

- **`packages/shared`:**
  - `dice.ts`: `DiceRoll.attack`.
  - `commands.ts`: `dice.roll.attack`.
  - `decide.ts`: attack validation and `can.attackWith`.
  - `visibility.ts`: strip hidden-token attack context; resync on public rolls that name a hidden token.
  - `activityLog.ts`.
  - Unit tests in `decide.test.ts`, `visibility.test.ts` and `activityLog.test.ts`, or a new `attackRolls.test.ts`.
- **`apps/server`:** no pipeline change. New wire test `test/attackRolls.test.ts`.
- **`apps/web`:**
  - `board/tools.ts`: new `attack` tool kind.
  - `board/boardView.ts`: targeting line, token pick, crosshair.
  - `board/Board.tsx`: `BoardHandle.startAttack` and `showPing`, hint, reporting a picked target.
  - New `panels/AttackPanel.tsx` (the Attack section) and `panels/attackRoll.ts` (pure helpers).
  - `RoomPanel.tsx`: the section in the Play tab. `RoomPage.tsx`: the target shared by the board and the section.
  - `DicePanel.tsx`: attack line in the roll log.
- **Docs:** `docs/adr/0010-attack-roll-context.md`.
- **Compatibility:** no migration. Existing events replay unchanged because `attack` is optional.
