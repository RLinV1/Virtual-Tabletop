# Spec Delta

## MODIFIED Requirements

### Requirement: The viewer picks a look in the room
The room's Dice panel SHALL offer a Dice look choice of Classic or any of the viewer's looks, and a link that opens the library's Dice tab in a new tab. A signed-in viewer SHALL choose from their account's looks, whether they are the room's GM or a player. A signed-out viewer SHALL choose from the looks kept in their browser. A look saved, renamed, chosen or deleted in another tab of the same browser SHALL show up in an open room without reloading. A change made on another device SHALL show up the next time the room page is opened or brought back to the foreground.

#### Scenario: Look saved while a room is open
- **WHEN** the viewer renames the look in use in the library while a room is open in another tab
- **THEN** the room's Dice look choice shows the new name without a reload

#### Scenario: Player brings their dice to someone else's game
- **WHEN** signed-in Kim, whose account has the look "Jungle" in use, joins Sam's room as a player and rolls 1d20
- **THEN** Kim's d20 is drawn in "Jungle" on Kim's screen

#### Scenario: Change from another device
- **WHEN** Kim chooses a different look on her phone, then brings the room tab on her laptop back to the foreground
- **THEN** the laptop's Dice look choice shows the look chosen on the phone

### Requirement: Looks stay in the viewer's browser
Where looks are kept SHALL depend on whether the viewer is signed in:
- **Signed in:** looks and the choice of look in use SHALL be saved to the account. They SHALL be the same on every device the viewer signs in on and in every room they are in, as GM or player.
- **Signed out:** looks and the choice SHALL be kept in that browser only.

In either case, nothing about a look SHALL be sent to other participants, and other participants SHALL see the viewer's rolls exactly as before. Signing out SHALL stop the account's looks from being drawn on that device, and SHALL leave the account's looks unchanged. A picture kept by the earlier one-skin d6 prototype SHALL be moved into a browser look once, and made the look in use if none was chosen.

#### Scenario: Others see an ordinary roll
- **WHEN** a player using a look rolls 2d6
- **THEN** every other participant sees classic dice, and nothing about the look reaches any other participant

#### Scenario: Same dice on another device
- **WHEN** Kim makes the look "Jungle" on her laptop while signed in, then signs in on her phone
- **THEN** the phone's Dice tab lists "Jungle", and it is the look in use there too

#### Scenario: Signed out keeps the browser's own looks
- **WHEN** a signed-out viewer makes a look
- **THEN** it is kept in that browser only, and nothing about it is sent to the server

#### Scenario: Signing out
- **WHEN** Kim signs out on a shared computer
- **THEN** her account's looks are no longer listed or drawn on it, and they are unchanged when she signs in elsewhere

## ADDED Requirements

### Requirement: Account looks are checked and private on the server
The server SHALL accept a look's picture only from its signed-in owner. It SHALL accept only PNG, JPEG or WebP up to 5 MB, with the proportions and largest sizes the browser accepts: 3:2 up to 1536 × 1024, or 1:1 up to 512 × 512. A look SHALL hold at most one picture per die type, and its name SHALL be 1 to 40 characters. An account SHALL hold at most 50 looks. A request for another account's look SHALL get HTTP 404 and change nothing. A picture's address SHALL NOT contain the look's name or the uploaded file's name.

#### Scenario: Another account's look
- **WHEN** signed-in Sam tries to read, rename, delete or choose a look owned by Kim
- **THEN** the server responds 404 and Kim's look is unchanged

#### Scenario: Picture out of bounds
- **WHEN** a signed-in viewer sends a 1920 × 1080 picture, a GIF, or a file over 5 MB for a die
- **THEN** the server refuses it with a message saying why, and the look is unchanged

#### Scenario: Too many looks
- **WHEN** an account with 50 looks asks for a new one
- **THEN** the server refuses it, and the Dice tab says the limit has been reached

### Requirement: Bring this browser's dice looks into the account
When a viewer is signed in and their browser still keeps looks of its own, the Dice tab SHALL offer to save those looks to the account. It SHALL say how many there are. The save SHALL happen only when the viewer chooses it. Each look SHALL be added to the account with its name and pictures, beside the looks the account already has; nothing in the account SHALL be replaced. Once every look is saved, the browser's own copies SHALL be removed. If the account had no look in use, the browser's look in use SHALL become the account's. A look that cannot be saved SHALL stay in the browser, and the Dice tab SHALL say which one.

#### Scenario: Player keeps the dice they made as a guest
- **WHEN** a viewer who made two looks while signed out signs in and chooses to save them
- **THEN** the account lists both looks, the browser no longer keeps its own copies, and the same two looks appear when the viewer signs in on another device

#### Scenario: Nothing replaced
- **WHEN** the account already has a look named "Jungle" and the browser's look of the same name is saved
- **THEN** the account lists two looks named "Jungle"

#### Scenario: Partial failure
- **WHEN** one of three browser looks is refused by the server
- **THEN** the other two are saved to the account, the refused one stays in the browser, and the Dice tab names it
