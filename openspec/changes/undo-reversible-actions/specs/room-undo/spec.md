## Purpose

Lets the GM pick a recent action from the activity log and reverse it without rebuilding it by hand, while keeping the room's history append-only (FR-REC-02, FR-REC-03).

## ADDED Requirements

### Requirement: GM-only undo of a chosen action
The system SHALL let only the room's GM undo. The GM SHALL choose the action to undo from the activity log, and undo SHALL reverse exactly that action, regardless of which participant performed it. Any recent undoable action MAY be chosen, not only the most recent one. The server SHALL refuse an undo request from a player as forbidden and SHALL append nothing.

#### Scenario: GM undoes a player's move
- **WHEN** Mara moves her token Rogue from (100, 100) to (300, 100) and the GM undoes that move from the activity log
- **THEN** Rogue is back at (100, 100) for every connected client

#### Scenario: GM undoes an older action
- **WHEN** the GM moves Goblin, then adds the prone condition to Goblin, then undoes the move
- **THEN** Goblin is back at its old position, still prone, and the condition change can still be undone

#### Scenario: Player cannot undo
- **WHEN** a player sends an undo request
- **THEN** the server refuses it as forbidden and room state and history are unchanged

#### Scenario: Action already undone or unknown
- **WHEN** the GM asks to undo an action that was already undone, that is too old, or that does not exist
- **THEN** the server refuses it with a message that the action can no longer be undone, and appends nothing

### Requirement: Reversible actions
The following SHALL be undoable: token moves, token hide/reveal, token condition changes, hit/miss rulings on attack rolls, and applying a damage roll. An action that changes several of these in one request (a token editor save) SHALL be undoable when every change it made is in this set. HP and AC edits on their own SHALL NOT be undoable. Dice rolls, and every other action, SHALL NOT be undoable. An action that is not undoable SHALL NOT block undo of other actions.

#### Scenario: Mixed editor save is not undoable
- **WHEN** the GM saves the token editor with a new name and a new position for Goblin
- **THEN** the activity log offers no Undo for that save

#### Scenario: Manual HP edit is not undoable
- **WHEN** the GM sets Goblin's HP from 15 to 3 in the token editor
- **THEN** the activity log offers no Undo for that edit

#### Scenario: Dice roll is not undoable
- **WHEN** a player rolls an attack
- **THEN** the activity log offers no Undo for the roll, and a ruling or damage applied from it can still be undone

### Requirement: One action is undone as a unit
Every change made by one request SHALL be undone together by a single undo. Undo SHALL restore each changed value to the value it had immediately before the action.

#### Scenario: Editor save moved and hid a token
- **WHEN** the GM saves the token editor with a new position and hidden on for Goblin, then undoes that save
- **THEN** Goblin is back at its old position and visible again after that one undo

#### Scenario: Applied damage
- **WHEN** the GM applies a damage roll that lowers Goblin from 15 HP to 8 HP, then undoes the apply
- **THEN** Goblin is back at 15 HP, the roll no longer reads Applied, and the roll can be applied again

### Requirement: Undo is append-only
Undo SHALL append new events that restore the earlier values. It SHALL NOT delete, edit, or reorder any committed event. The original action and the undo SHALL both remain in the room's history with their own sequence numbers.

#### Scenario: History keeps both
- **WHEN** the GM moves Goblin and then undoes the move
- **THEN** the room's history contains the move and, after it, the undo

### Requirement: Undo refuses when state has changed since
Undo SHALL proceed only when, for every change in the action, the current state still equals the value that action set. For a token, it must still exist and have the position, hidden flag, conditions or HP and AC the action gave it. For a roll, it must still be in the roll log with the ruling the action gave it, or still be Applied. Otherwise the server SHALL refuse the undo with a message that names the token or roll, and SHALL append nothing. The refused action SHALL stay undoable if the state later matches again.

#### Scenario: Token moved again since
- **WHEN** the GM moves Goblin to (300, 100), then moves Goblin to (500, 100), and then undoes the first move
- **THEN** the server refuses with a message that Goblin has changed since, and Goblin stays at (500, 100)

#### Scenario: Token deleted since
- **WHEN** the GM hides Orc, then deletes Orc, then undoes the hide
- **THEN** the server refuses with a message that Orc no longer exists

#### Scenario: Ruling changed since
- **WHEN** the GM rules Aria's attack on Goblin a hit, then changes it to a miss, then undoes the hit ruling
- **THEN** the server refuses with a message that the Aria → Goblin roll has changed since

#### Scenario: HP edited after an apply
- **WHEN** the GM applies damage to Goblin, then edits Goblin's HP by hand, then undoes the apply
- **THEN** the server refuses with a message that Goblin has changed since

### Requirement: Bounded undo history
The system SHALL keep at least the 20 most recent undoable actions per room available for undo. Actions older than that bound MAY no longer be undoable. The undo history SHALL survive a server restart or room reload.

#### Scenario: Reload keeps history
- **WHEN** the GM moves Goblin, the room is unloaded and loaded again from storage, and the GM undoes the move
- **THEN** Goblin moves back

#### Scenario: Events from before this feature
- **WHEN** a room's log contains events committed before undo existed
- **THEN** the room loads normally, and none of those older actions can be undone, because which events belonged to one action was not recorded

#### Scenario: Undoing keeps the rest of a full history
- **WHEN** the room has more than 20 undoable actions and the GM undoes one of them
- **THEN** the 19 other newest actions stay undoable

### Requirement: Undo respects player visibility
Players SHALL receive the effects of an undo only as their filtered view allows. Undoing a change to a hidden token, or to a GM-only roll, SHALL NOT reveal it to players. The undo history itself, and which events belong to one action, SHALL NOT be sent to players.

#### Scenario: Undo of a hidden token's move
- **WHEN** the GM moves hidden token Orc and then undoes the move
- **THEN** players receive nothing that names Orc or its positions

#### Scenario: Undo of a reveal
- **WHEN** the GM reveals Orc and then undoes the reveal
- **THEN** Orc disappears from every player's board

#### Scenario: Undo of a GM-only damage apply
- **WHEN** the GM applies a GM-only damage roll and then undoes the apply
- **THEN** players learn nothing about the roll being taken back

### Requirement: Undo from the activity log
The GM's activity log SHALL show an Undo button on each entry whose action can still be undone. An action that spans several entries SHALL show one Undo button, on its newest entry. The button SHALL name the action it undoes. Entries whose action was undone SHALL be marked Undone. A refused undo SHALL show the server's message on that entry. The room SHALL offer no undo control outside the activity log, and no keyboard shortcut for undo. Players SHALL NOT see any undo control.

#### Scenario: Undo button names the action
- **WHEN** the GM opens the activity log after moving Goblin
- **THEN** the move's entry has an Undo button that reads as undoing the move of Goblin

#### Scenario: Undone entry is marked
- **WHEN** the GM undoes the move of Goblin from the activity log
- **THEN** the log shows a new entry for the undo, and the move's entry is marked Undone with no Undo button

#### Scenario: Refusal shown on the entry
- **WHEN** the GM presses Undo on an entry whose token has changed since
- **THEN** that entry shows the message that the token has changed since

#### Scenario: Player view
- **WHEN** a player opens the room
- **THEN** no undo control is shown
