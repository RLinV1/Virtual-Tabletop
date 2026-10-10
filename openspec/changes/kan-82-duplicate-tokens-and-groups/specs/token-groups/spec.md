## Purpose

Lets the GM organise the tokens of one live room into named groups, such as the enemies of one fight, and start an encounter from them, without players learning anything about the groups.

## ADDED Requirements

### Requirement: GM manages groups
The GM SHALL be able to create a group with a name of 1 to 40 characters, rename it, and delete it. A room SHALL hold at most 30 groups. Group names SHALL be unique within the room, compared after trimming and ignoring case. Deleting a group MUST NOT delete or change its tokens; they become ungrouped. Players MUST NOT be able to create, rename or delete groups.

#### Scenario: Create and rename
- **WHEN** the GM creates a group "Gate guards" and renames it "Gate guards (north)"
- **THEN** the GM's roster shows a group named "Gate guards (north)"

#### Scenario: Delete keeps tokens
- **WHEN** the GM deletes a group holding two goblins
- **THEN** both goblins are still on the board, now ungrouped

#### Scenario: Duplicate name
- **WHEN** the GM creates a group named "gate guards" while "Gate guards" exists
- **THEN** the server rejects it and no group is added

#### Scenario: Player tries to create a group
- **WHEN** a player sends a create-group command
- **THEN** the server rejects it as forbidden and nothing changes

### Requirement: Group membership
The GM SHALL be able to put one or more tokens into a group, or take them out of any group, in one action. A token SHALL belong to at most one group: putting it into a group SHALL take it out of the one it was in. A group MAY be empty. A token that is deleted SHALL disappear from its group, and SHALL be back in that group if the deletion is undone or a checkpoint restores it. Players MUST NOT be able to change membership.

#### Scenario: Move a token between groups
- **WHEN** "Goblin 2" is in "Gate guards" and the GM puts it into "Patrol"
- **THEN** "Goblin 2" is in "Patrol" and no longer in "Gate guards"

#### Scenario: Empty group
- **WHEN** the GM creates "Reinforcements" and assigns nothing to it
- **THEN** the roster shows "Reinforcements" with no tokens

### Requirement: Groups in the GM's roster
The GM's token roster SHALL list tokens under their group's heading, groups in creation order, followed by an "Ungrouped" section. Each group heading SHALL be collapsible and SHALL offer Hide all, Show all, Rename and Delete. Hide all and Show all SHALL change only the group's tokens, using token visibility. Selecting all of a group's tokens on the board is out of scope until the board supports selecting several tokens.

#### Scenario: Hide a group
- **WHEN** the GM chooses Hide all on "Back room cultists"
- **THEN** every token in that group becomes hidden and players' boards no longer show them

### Requirement: Start an encounter from groups
The GM SHALL be able to choose one or more groups and open the Start encounter dialog with those groups' tokens and every token owned by an active player already included, all other tokens not included. The GM SHALL be able to include or leave out any token before starting. Only included tokens with a score SHALL enter the turn order.

#### Scenario: Start from one group
- **WHEN** the GM starts an encounter from "Gate guards" (two goblins) in a room with two player tokens and a third, ungrouped goblin
- **THEN** the dialog includes the two goblins and the two player tokens, and leaves out the third goblin

#### Scenario: Combine groups
- **WHEN** the GM chooses "Gate guards" and "Patrol"
- **THEN** the dialog includes the tokens of both groups and the player tokens

### Requirement: Group changes and encounter starts can be undone
Creating, renaming and deleting a group, and changing membership, SHALL each be one undoable action in the GM's activity log, restoring exactly the names and memberships they replaced. Starting initiative SHALL be one undoable action that restores the turn order and the saved initiative scores it replaced. An undo MUST be refused when the value it would restore has since been changed by a newer action.

#### Scenario: Undo a group deletion
- **WHEN** the GM deletes "Gate guards" (two goblins) and then undoes that
- **THEN** "Gate guards" is back with both goblins in it

#### Scenario: Undo starting an encounter
- **WHEN** no encounter was running, the GM starts one from "Gate guards", and then undoes the start before advancing
- **THEN** no encounter is running and each token's saved initiative score is what it was before

#### Scenario: Undo a start after advancing
- **WHEN** the GM starts an encounter, advances the turn, and then tries to undo the start
- **THEN** the undo is refused with a message that the turn order has changed

### Requirement: Players never see groups
Players MUST NOT receive group names, ids or membership in any snapshot, event or REST response. A group change SHALL reach a player only as an advance of the room's sequence number. Undoing an encounter start SHALL reach a player as their filtered turn order and nothing else about the GM's groups.

#### Scenario: Player's state
- **WHEN** the GM has groups "Gate guards" and "Patrol" with tokens in them, including a hidden token
- **THEN** no player's state or event stream contains either group's name or id, or any membership

#### Scenario: Player rejoins
- **WHEN** a player reconnects after the GM changed groups
- **THEN** the player's snapshot has no group data
