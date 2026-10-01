# Spec Delta

## Purpose

Lets a participant pick up the dice from the Dice panel and throw them onto the map. The same 3D dice tumble across the map and land where they were let go, on the values the server rolled, on the thrower's board and, replayed, on everyone else's. A roll made with Roll is thrown in the middle of the roller's own board only. Each roll's result then slides in as a small card in the board's corner.

## ADDED Requirements

### Requirement: A die can be dragged from the Dice panel onto the map to roll
The Dice panel SHALL offer a draggable 3D die alongside the existing expression input, Roll button and quick chips, which SHALL keep working unchanged. Releasing the die over the map SHALL roll the panel's current expression publicly, exactly as the Roll button would. The drag SHALL work with a mouse and with touch. While held, the die SHALL follow the pointer in its 3D shape.

The die SHALL NOT be draggable, and SHALL say why, in any of these cases:
- the room has no map;
- the expression rolls more than 10 dice;
- the GM has ticked "Roll privately". Private rolls stay off the board (`board-dice-rolls`).

The Roll button SHALL still roll in all of those cases.

#### Scenario: Throwing rolls the typed expression
- **WHEN** a player with `2d6+1` in the expression field drags the die over the map and releases it
- **THEN** a `2d6+1` roll is made by that player and appears in everyone's roll log

#### Scenario: Invalid expression
- **WHEN** the expression field holds an invalid expression
- **THEN** the die cannot be picked up and the existing validation message is shown

#### Scenario: Released off the map
- **WHEN** the die is released outside the visible map, or Escape is pressed while it is held
- **THEN** no roll is made and the die returns to the panel

#### Scenario: No map
- **WHEN** the room has no map
- **THEN** the die is disabled with a hint that a map is needed, and the Roll button still rolls

#### Scenario: More than 10 dice
- **WHEN** the expression field holds `12d6`
- **THEN** the die is disabled with a hint that at most 10 dice can be thrown on the map, and the Roll button still rolls `12d6`

#### Scenario: Exactly 10 dice
- **WHEN** the expression field holds `10d6` and the die is thrown onto the map
- **THEN** all ten dice roll across the thrower's board

#### Scenario: Private roll
- **WHEN** the GM ticks "Roll privately"
- **THEN** the die is disabled with a hint that private rolls stay off the board, and Roll still rolls privately

### Requirement: The throw's path is set by the release
The throw SHALL start at the release point and land at a point derived from the pointer's velocity at release. A slow release SHALL land near the release point; a faster flick SHALL land further along its direction. The landing point SHALL be kept inside the map. Both points SHALL be board coordinates (map image pixels).

#### Scenario: Flick direction
- **WHEN** the die is flicked to the right and released
- **THEN** it lands to the right of the release point, inside the map

#### Scenario: Flick toward the edge
- **WHEN** the die is flicked hard toward the map's edge
- **THEN** it lands inside the map, at or near the edge

### Requirement: Everyone sees the throw where the die was let go
Throwing a die SHALL send exactly the same roll command as pressing Roll with the same expression. Just before it, the thrower's browser SHALL send a dice drop: the release and landing points and the expression, on the ephemeral channel (ADR 0014). The dice drop SHALL be relayed to the room's other clients, reliably, and SHALL NOT be persisted or sequenced. The server SHALL NOT relay a dice drop whose points are not on the current map.

Every viewer SHALL keep dice drops in the order each thrower sent them, for up to 5 seconds. When a roll arrives, its dice SHALL land at its thrower's oldest waiting drop with the same expression, the same way as on the thrower's board, and that drop SHALL be used up. A viewer that missed the dice drop SHALL see only the roll's result card.

#### Scenario: Another player sees the same throw
- **WHEN** player A throws a `2d6` onto the map
- **THEN** player B sees the same two dice tumble from A's release point and land at the same spot, showing the rolled values, and no dice in the middle of the board

#### Scenario: Only the drop crosses the wire
- **WHEN** a die is thrown onto the map
- **THEN** the thrower sends one dice drop and the plain `dice.roll` command, and nothing about the drop is persisted

#### Scenario: Forged drop
- **WHEN** a client sends a dice drop with a point off the map
- **THEN** the server does not relay it

#### Scenario: Throws in a row
- **WHEN** player A throws `2d6` at one spot and, before those dice land, `2d6` at another
- **THEN** on every board each roll's dice land at its own spot

#### Scenario: Drop missed
- **WHEN** a viewer never receives the dice drop
- **THEN** that viewer sees no dice for that roll, only its result card

### Requirement: The thrower sees their dice roll across the map
On the thrower's board, and on every board that replays the throw, the roll's dice SHALL land where the die was let go: they SHALL tumble from the release point toward the landing point, bounce, and come to rest showing the rolled values. They SHALL be drawn as the same polyhedra and numbering as every other die. Each die's path and resting attitude SHALL depend only on the roll and the two points. The dice SHALL stay at their board position while the viewer pans or zooms, SHALL remain visible for a few seconds after landing, and SHALL then fade away. The dice SHALL NOT block board input. When they land, the board's result card SHALL show the roll, without a second set of dice in the middle of the board.

#### Scenario: Dice land on the map
- **WHEN** a player throws a `2d6` onto the map
- **THEN** two d6 tumble from the release point and come to rest near the landing point, showing the rolled values, and then the result card slides in

#### Scenario: No second throw
- **WHEN** a player throws a die onto the map
- **THEN** their board shows no throw of that roll in the middle of the board, before or after the dice land

#### Scenario: Panning during a throw
- **WHEN** the thrower pans or zooms while dice are on the board
- **THEN** the dice stay over the same map location

#### Scenario: Dice leave the board
- **WHEN** a few seconds have passed since the dice landed
- **THEN** the dice fade out and the board is clear

### Requirement: A roll made with Roll lands in the middle of the roller's own board
When a participant makes a public roll without letting a die go (the Dice panel's Roll, or an attack), their own board SHALL throw its dice into the middle of the visible board, kept on the map when there is one, in the same 3D dice and on the same layer as dropped dice. Every other viewer SHALL see no dice for it, only its result card. This replaces `board-dice-rolls`' throw of every public roll in the centre of everyone's board.

#### Scenario: Rolling with Roll
- **WHEN** a player presses Roll with `1d20`
- **THEN** a d20 tumbles into the middle of their board, comes to rest, and the result card slides in

#### Scenario: Seen by another player
- **WHEN** another player presses Roll with `2d6`
- **THEN** this viewer's board shows no dice, and the result card slides in at once

### Requirement: Each roll is thrown on its own
Every roll SHALL be thrown, and land, on its own: several rolls, dropped or rolled with Roll, MAY be in the air at once, and none SHALL hold back, replace or re-throw another. Each roll's total SHALL wait, in the Dice panel's latest-roll row, the Attack section's card and the GM's Rulings list, until that roll's dice land on this viewer's screen, and its result card SHALL slide in then. A roll with no dice on this screen SHALL show its total and card at once.

#### Scenario: Total appears on landing
- **WHEN** a roll is thrown onto the map
- **THEN** the thrower's Dice panel row reads as rolling until the dice on the board come to rest, then shows the total

#### Scenario: Several throws in a row
- **WHEN** a player throws three dice onto the map one after another, and presses Roll in between
- **THEN** each throw lands at its own drop, the Roll lands in the middle, and each shows its result card as it lands

### Requirement: Board throws are not replayed
A board throw SHALL only ever play for a roll that arrives while the page is connected. Reloading, reconnecting or switching phone tabs SHALL NOT throw anything on the board; a roll whose throw was interrupted SHALL count as already landed.

#### Scenario: Reload mid-throw
- **WHEN** the thrower reloads while their dice are in the air
- **THEN** no dice are thrown on their board after the reload, and the roll's total shows in the Dice panel

### Requirement: Board throws degrade to the result card
A roll's dice SHALL NOT animate on the board in either of these cases:
- the viewer prefers reduced motion;
- the browser cannot run the animation.

In those cases the roll SHALL land at once, with its total and result card. When the server rejects the roll or does not answer within 5 seconds, the held die SHALL fade out at the release point, the drop SHALL be forgotten, and the error SHALL be shown in the Dice panel.

#### Scenario: Reduced motion
- **WHEN** a viewer who prefers reduced motion throws a die onto the map
- **THEN** no dice tumble across the map, and the result shows at once

#### Scenario: Rejected throw
- **WHEN** a thrown roll is rejected by the server
- **THEN** the held die fades out where it was released and the Dice panel shows the rejection message

### Requirement: The result slides into the corner
When a roll's dice land, or at once for a roll with no dice on this screen, the board's result card (`board-dice-rolls`) SHALL slide in from the right into the board's bottom-right corner, stay for 4 seconds and slide back out, instead of sitting over the middle of the map. It SHALL show the total, who rolled what (or the attack's summary), and a GM-only badge for a private roll. It SHALL NOT take pointer input. With reduced motion it SHALL appear and disappear without sliding.

#### Scenario: Corner card
- **WHEN** any roll's dice land
- **THEN** a card with its result slides into the bottom-right corner of the board, clear of the map's middle, and leaves after 4 seconds

