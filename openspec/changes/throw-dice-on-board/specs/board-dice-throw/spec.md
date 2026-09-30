# Spec Delta

## Purpose

Lets a participant pick up the dice from the Dice panel and throw them onto the map. On the thrower's own board, the same 3D dice tumble across the map and land on the values the server rolled. The roll itself stays an ordinary roll for everyone else.

## ADDED Requirements

### Requirement: A die can be dragged from the Dice panel onto the map to roll
The Dice panel SHALL offer a draggable 3D die alongside the existing expression input, Roll button and quick chips, which SHALL keep working unchanged. Releasing the die over the map SHALL roll the panel's current expression, with the panel's current visibility (public, or GM-only for the GM), exactly as the Roll button would. The drag SHALL work with a mouse and with touch. While held, the die SHALL follow the pointer in its 3D shape. The die SHALL NOT be draggable, and SHALL say why, when the room has no map or when the expression rolls more than 10 dice; the Roll button SHALL still roll such an expression.

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

### Requirement: The throw's path is set by the release
The throw SHALL start at the release point and land at a point derived from the pointer's velocity at release. A slow release SHALL land near the release point; a faster flick SHALL land further along its direction. The landing point SHALL be kept inside the map. Both points SHALL be board coordinates (map image pixels).

#### Scenario: Flick direction
- **WHEN** the die is flicked to the right and released
- **THEN** it lands to the right of the release point, inside the map

#### Scenario: Flick toward the edge
- **WHEN** the die is flicked hard toward the map's edge
- **THEN** it lands inside the map, at or near the edge

### Requirement: The throw stays on the thrower's screen
Throwing a die SHALL send exactly the same roll command as pressing Roll with the same expression and visibility. The release point, landing point and flick SHALL NOT be sent to the server or to any other participant. Every other participant, including the thrower's other open tabs, SHALL see the roll exactly as a roll made with the Roll button: thrown in their Dice panel tray, with the result held until it lands.

#### Scenario: Another player sees an ordinary roll
- **WHEN** player A throws a die onto the map
- **THEN** player B sees no dice on their board, and sees A's roll thrown in B's Dice panel tray as for any roll

#### Scenario: Nothing extra crosses the wire
- **WHEN** a die is thrown onto the map
- **THEN** the only message sent is the `dice.roll` command, with no position data

### Requirement: The thrower sees their dice roll across the map
On the thrower's board, the roll's dice SHALL tumble from the release point toward the landing point, bounce, and come to rest showing the rolled values. They SHALL be drawn as the same polyhedra and numbering as the Dice panel tray, in the GM's private colours for a GM-only roll. Each die's path and resting attitude SHALL depend only on the roll and the two points. The dice SHALL stay at their board position while the viewer pans or zooms, SHALL remain visible for a few seconds after landing, and SHALL then fade away. The dice SHALL NOT block board input.

#### Scenario: Dice land on the map
- **WHEN** a player throws a `2d6` onto the map
- **THEN** two d6 tumble from the release point and come to rest near the landing point, showing the rolled values

#### Scenario: GM throws privately
- **WHEN** the GM ticks "Roll privately" and throws the die onto the map
- **THEN** the GM sees the dice land in the private colours, and no player's board or roll log shows anything

#### Scenario: Panning during a throw
- **WHEN** the thrower pans or zooms while dice are on the board
- **THEN** the dice stay over the same map location

#### Scenario: Dice leave the board
- **WHEN** a few seconds have passed since the dice landed
- **THEN** the dice fade out and the board is clear

### Requirement: The result waits for dice thrown on the board
On the thrower's screen, while a roll's dice are in the air on the board, the Dice panel, the attack card and the GM's Rulings list SHALL hold its total as they do for a tray throw. They SHALL show it when the dice land. The thrower's Dice panel tray SHALL NOT throw a second set of dice for that roll; it SHALL show the dice at rest once they land.

#### Scenario: Total appears on landing
- **WHEN** a roll is thrown onto the map
- **THEN** the thrower's Dice panel row reads as rolling until the dice on the board come to rest, then shows the total

### Requirement: Board throws are not replayed
A board throw SHALL only ever play for a roll the viewer has just thrown in the current page. Reloading, reconnecting or switching phone tabs SHALL NOT throw anything on the board; a roll whose throw was interrupted SHALL show at rest in the Dice panel.

#### Scenario: Reload mid-throw
- **WHEN** the thrower reloads while their dice are in the air
- **THEN** no dice are thrown on their board after the reload, and the roll appears at rest in the Dice panel

### Requirement: Board throws degrade to the tray
A thrown roll SHALL NOT animate on the board in any of these cases:
- the viewer prefers reduced motion;
- the browser cannot run the animation;
- the roll cannot be matched to the throw.

In those cases its dice SHALL be shown at rest in the Dice panel tray and its result shown at once. When the server rejects the roll or does not answer within 5 seconds, the held die SHALL fade out at the release point and the error SHALL be shown in the Dice panel.

#### Scenario: Reduced motion
- **WHEN** a viewer who prefers reduced motion throws a die onto the map
- **THEN** no dice move on the board, and the result shows at once in the Dice panel

#### Scenario: Rejected throw
- **WHEN** a thrown roll is rejected by the server
- **THEN** the held die fades out where it was released and the Dice panel shows the rejection message
