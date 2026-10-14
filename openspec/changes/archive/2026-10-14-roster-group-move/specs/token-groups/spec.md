## ADDED Requirements

### Requirement: GM changes a token's group from the roster
When the room has at least one group, each row of the GM's token roster SHALL have a grip handle. Clicking the handle, or pressing Enter or Space on it, SHALL open a Move to menu listing every group in creation order, then Ungrouped. The token's current group SHALL be marked and SHALL NOT be selectable. Choosing another entry SHALL put the token into that group, or take it out of any group for Ungrouped, as one action, and close the menu. Dragging the handle onto a group's section, either its heading or its token list, SHALL do the same for that group. This SHALL include a collapsed group, an empty group and the Ungrouped section. The section under the pointer SHALL be highlighted while dragging. Dropping a token on the group it is already in, or outside any section, SHALL change nothing. Each move SHALL be one undoable action, as any other membership change. Players SHALL NOT see the handle, and their roster SHALL stay a flat list. When the room has no groups, the handle SHALL NOT be shown.

#### Scenario: Move by menu
- **WHEN** "Goblin 2" is in "Gate guards" and the GM opens its Move to menu and chooses "Patrol"
- **THEN** "Goblin 2" is listed under "Patrol" and no longer under "Gate guards", and the menu is closed

#### Scenario: Current group marked
- **WHEN** the GM opens the Move to menu for "Goblin 2" in "Gate guards"
- **THEN** the menu lists the room's groups in creation order, then Ungrouped, with "Gate guards" marked and not selectable

#### Scenario: Ungroup by menu
- **WHEN** the GM chooses Ungrouped in the Move to menu of a token in "Patrol"
- **THEN** the token is listed under Ungrouped

#### Scenario: Move by drag
- **WHEN** the GM drags the handle of "Cultist" (Ungrouped) onto the heading of "Back room"
- **THEN** "Cultist" is listed under "Back room"

#### Scenario: Drop on a collapsed or empty group
- **WHEN** the GM drags a token's handle onto the collapsed "Patrol" heading, or onto the empty "Reinforcements" section
- **THEN** the token is put into that group

#### Scenario: Drop on its own group
- **WHEN** the GM drags "Goblin" from "Gate guards" and drops it on "Gate guards"
- **THEN** nothing is sent and nothing changes

#### Scenario: Undo a move
- **WHEN** the GM moves "Goblin 2" from "Gate guards" to "Patrol" with the handle and then undoes that action
- **THEN** "Goblin 2" is back in "Gate guards"

#### Scenario: Keyboard only
- **WHEN** the GM tabs to a token's handle, presses Enter, moves to "Patrol" and presses Enter
- **THEN** the token is put into "Patrol" and focus returns to the handle

#### Scenario: No groups
- **WHEN** the room has no groups
- **THEN** no roster row shows a handle

#### Scenario: Players
- **WHEN** a player views the token roster
- **THEN** no row shows a handle and no group names appear
