# Spec Delta

## REMOVED Requirements

### Requirement: A look dresses only the viewer's own public rolls
**Reason**: The table now sees each person's look. Keeping a look on its owner's screen only was a limit of storing looks in the browser, and `user-accounts` lifted it.
**Migration**: Replaced by "The table sees each person's dice look" below. A guest or signed-out viewer's browser look still dresses only their own rolls on their own screen.

### Requirement: Looks stay in the viewer's browser
**Reason**: Where a look is kept and who sees it are now one rule that includes the room.
**Migration**: Replaced by "Where looks are kept and who sees them" below. Account and browser storage are unchanged from `user-accounts`.

## ADDED Requirements

### Requirement: The table sees each person's dice look
A person whose room seat is kept on their account SHALL be able to put their account's look in use on the table. From then on, every participant SHALL see that person's public rolls in that look:
- the roll thrown in the middle of the board with Roll;
- dice dropped on the map;
- the die they drag;
- these same throws shown in each viewer's other tabs.

Each face SHALL show its part of the picture under the die's shading. The app SHALL still print every number, so a look never changes what a die reads. A die type without a picture SHALL be drawn classic. GM-only rolls SHALL keep the private slate look for everyone. Choosing Classic SHALL take the person's look off the table. Late joiners and reconnecting participants SHALL see current looks from the room's state. A guest, or a person whose seat is not kept on an account, SHALL keep their browser look on their own screen only, and the Dice panel SHALL say that signing in and keeping the seat shows their dice to the table.

#### Scenario: Everyone sees Kim's dice
- **WHEN** signed-in Kim, whose seat is kept on her account, uses the look "Jungle" and rolls 1d20 with Roll
- **THEN** Kim, Sam and every other participant see her d20 in "Jungle", showing the rolled number

#### Scenario: Late joiner
- **WHEN** Alex joins after Kim chose "Jungle" and Kim then drops 2d6 on the map
- **THEN** Alex sees Kim's d6s in "Jungle"

#### Scenario: GM-only roll stays private
- **WHEN** GM Sam, using a look on the table, rolls privately
- **THEN** Sam sees the private slate dice, and players see nothing of the roll

#### Scenario: Back to classic
- **WHEN** Kim chooses Classic in the Dice panel
- **THEN** every participant sees Kim's next rolls as classic dice

#### Scenario: Guest look stays on the guest's screen
- **WHEN** a guest using a browser look rolls 1d20
- **THEN** the guest sees their look, every other participant sees classic dice, and the Dice panel explains how to show dice to the table

### Requirement: Only the owner can use a look
The server SHALL put a look on the table for a participant only when the look belongs to the account that holds that participant's seat. A request to use any other look, including another participant's, SHALL be refused as `forbidden` and change nothing. A participant SHALL be able to set only their own look. What the room receives about a look SHALL be limited to the pictures needed to draw it, with no look name, owner or account. No screen SHALL offer to use, copy or save another participant's look.

#### Scenario: Using someone else's look
- **WHEN** Alex sends a request to use the look Kim has on the table
- **THEN** it is refused as `forbidden`, and Alex's dice are unchanged

#### Scenario: Setting another participant's look
- **WHEN** Kim sends a request to set Alex's dice look
- **THEN** it is refused as `forbidden`

#### Scenario: Nothing to identify the look
- **WHEN** Kim's look is on the table
- **THEN** what other participants receive contains the pictures' addresses and sizes, and not the look's name, Kim's email or her account id

### Requirement: The table follows the owner's choice
When the person chooses a look, chooses Classic, or edits the look in use, every room they have open SHALL be updated. A room they open later SHALL be updated when they enter it if its copy differs from their current choice. A look the owner deleted SHALL be taken off the table the next time they are in that room. Changes SHALL be limited to 10 per minute per connection; further changes SHALL be refused with a message and change nothing.

#### Scenario: Edit while playing
- **WHEN** Kim replaces the d20 picture of the look in use while "Goblin Cave" is open
- **THEN** every participant sees Kim's next d20 roll with the new picture

#### Scenario: Room opened later
- **WHEN** Kim chose a new look while away from "Crypt", then enters "Crypt"
- **THEN** "Crypt" shows her new look for her next roll

### Requirement: The GM can put a player's dice back to classic
The GM SHALL be able to reset any player's dice look in their room to classic. The player SHALL be able to put a look on the table again afterwards. A player SHALL NOT be able to reset anyone else's look.

#### Scenario: GM resets a look
- **WHEN** GM Sam chooses "Reset dice to classic" for Kim in the participants list
- **THEN** every participant sees Kim's next rolls as classic, and Kim's look is unchanged in her library

### Requirement: Each viewer can turn other people's looks off
Each viewer SHALL have a setting, on by default, to show other participants' dice looks. When it is off, that viewer SHALL see everyone else's rolls as classic dice and their own in their look. The setting SHALL apply to that viewer's screen only.

#### Scenario: Viewer prefers classic
- **WHEN** Alex turns off "Show other players' dice looks"
- **THEN** Alex sees Kim's rolls as classic dice, and Kim and Sam still see them in "Jungle"

### Requirement: Where looks are kept and who sees them
Looks and the choice of look in use SHALL be kept on the account when the person is signed in, and in the browser when they are not, as `user-accounts` introduced. A look a person puts on the table SHALL be visible to the participants of that room only. A picture that can no longer be loaded SHALL make that die draw classic for every viewer. Pictures shown to other participants SHALL be checked by the server from the file's own contents: PNG, JPEG or WebP, with the same proportions and largest sizes the browser accepts.

#### Scenario: Owner deleted the look
- **WHEN** Kim deletes the look that is on the table in a room she is not in
- **THEN** participants there see her dice as classic, with no broken image

#### Scenario: Declared size does not match the file
- **WHEN** a client uploads a dice picture declared as 512 × 512 whose file is 4000 × 4000
- **THEN** the server refuses it
