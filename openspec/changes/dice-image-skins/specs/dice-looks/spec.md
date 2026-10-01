# Spec Delta

## Purpose

Lets each viewer dress their own dice in pictures. They paint a die's template, or have an image AI paint it, or pick one square picture. The pictures stay in their own browser and only change how their own dice look, never what the dice read.

## ADDED Requirements

### Requirement: Dice looks are made in the library's Dice tab
A dice look SHALL be a named set of pictures, at most one per die type (d4, d6, d8, d10, d12, d20). The asset library's Dice tab SHALL list the viewer's looks as cards. Each card SHALL show a preview of dice in the look, its name, which die types have pictures, and whether it is in use. The card's actions SHALL be Use, Edit, and Delete behind an inline confirmation. The tab's toolbar SHALL offer a case-insensitive name search and a New dice look action, which SHALL create an empty look named "Dice look N" (the first unused N) and open its editor.

#### Scenario: New look
- **WHEN** a viewer with two looks named "Dice look 1" and "Dice look 2" chooses New dice look
- **THEN** an empty look named "Dice look 3" is created and its editor opens

#### Scenario: Delete asks first
- **WHEN** the viewer chooses Delete on a look's card
- **THEN** the card asks to confirm, and the look is removed only after they confirm

#### Scenario: Search
- **WHEN** the viewer types "jung" in the search field
- **THEN** only looks whose name contains "jung", case-insensitively, are shown

### Requirement: The editor shows each die once with one Edit menu
The editor SHALL show the look's name, which SHALL be editable, and one card per die type showing a preview of that die in the look. Each die card SHALL have a single Edit menu with these items:
- Copy template;
- Upload picture, named Replace picture when the die already has one;
- Reset to classic, only when the die has a picture.

After an action, a short note over the die's preview SHALL say what happened, and SHALL then clear. Changes SHALL be saved as they are made.

#### Scenario: A die without a picture
- **WHEN** the viewer opens the Edit menu of a die that has no picture
- **THEN** the menu offers Copy template and Upload picture, and no Reset to classic

#### Scenario: Reset
- **WHEN** the viewer chooses Reset to classic for a die
- **THEN** its picture is removed from the look and its preview shows the classic die

### Requirement: Every die has a template that matches how it is drawn
Each die type SHALL have a template: a 1536 × 1024 picture with a centred grid of square cells, one face per cell. Cells SHALL be numbered left to right, top to bottom as on a standard die; the d4's cells SHALL be its faces in order, each labelled with its three corner numbers. Each cell SHALL show:
- the face's exact outline, centred in the cell;
- where the app prints the face's number or numbers;
- which way is up.

Copy template SHALL put the template on the clipboard as an image. Where the browser won't allow that, it SHALL save the template as a file instead and say so.

#### Scenario: Copy a template
- **WHEN** the viewer chooses Copy template for the d20
- **THEN** a 1536 × 1024 PNG of the d20's 20-cell template is on the clipboard

#### Scenario: A cell lands on its face
- **WHEN** a picture painted on a die's template is applied to that die
- **THEN** each cell's outlined face covers exactly the matching face of the die, the right way up

### Requirement: One AI prompt for every die
The editor SHALL offer Copy AI prompt, which SHALL copy one prompt that works in two ways: with any die's template attached, it asks for a painted template of the same size and layout; on its own, it asks for one seamless square picture. The prompt SHALL ask for no numbers or text, no guide lines, and flat, evenly lit faces.

#### Scenario: Prompt copied
- **WHEN** the viewer chooses Copy AI prompt
- **THEN** the prompt is on the clipboard and the editor says so

### Requirement: Pictures are checked and kept as plain pixels
Upload picture SHALL accept a PNG, JPEG or WebP file of up to 5 MB whose proportions are:
- 3:2, taken as a painted template, at any size; or
- 1:1, taken as one picture for every face.

Any other file SHALL be refused with a message saying why. An accepted picture SHALL be redrawn in the browser, no larger than 1536 × 1024 (or 512 × 512 for a square picture), and only that redrawn copy SHALL be kept and shown.

#### Scenario: Wrong shape
- **WHEN** the viewer uploads a 1920 × 1080 picture
- **THEN** it is refused with a message naming the template's size and the square option, and the die is unchanged

#### Scenario: Square picture
- **WHEN** the viewer uploads a 1024 × 1024 picture for the d8
- **THEN** that picture covers every face of the d8

### Requirement: The viewer picks a look in the room
The room's Dice panel SHALL offer a Dice look choice of Classic or any saved look, and a link that opens the library's Dice tab in a new tab. A look saved, renamed, chosen or deleted in another tab of the same browser SHALL show up in an open room without reloading.

#### Scenario: Look saved while a room is open
- **WHEN** the viewer renames the look in use in the library while a room is open in another tab
- **THEN** the room's Dice look choice shows the new name without a reload

### Requirement: A look dresses only the viewer's own public rolls
The look in use SHALL draw the viewer's own public rolls:
- in the Dice panel tray;
- on the map;
- on the die they drag;
- on the attack card.

Each face SHALL show its part of the die's picture under the die's shading. The app SHALL still print every number, so a look never changes what a die reads. A die type without a picture SHALL keep the classic look. GM-only rolls SHALL keep the private look, and other participants' rolls SHALL keep the classic look.

#### Scenario: Own roll in a look
- **WHEN** a viewer using a look with a d20 picture rolls 1d20
- **THEN** their d20 is drawn in that picture, showing the rolled number

#### Scenario: GM-only roll
- **WHEN** the GM, using a look, rolls privately
- **THEN** the dice keep the private slate look

#### Scenario: Die without a picture
- **WHEN** a viewer using a look with only a d6 picture rolls 1d8
- **THEN** the d8 is drawn classic

### Requirement: Looks stay in the viewer's browser
Looks and the choice of look SHALL be kept in the viewer's browser only. Nothing about a look SHALL be sent to the server or to other participants, and other participants SHALL see the viewer's rolls exactly as before. A picture kept by the earlier one-skin d6 prototype SHALL be moved into a look once, and made the look in use if none was chosen.

#### Scenario: Others see an ordinary roll
- **WHEN** a player using a look rolls 2d6
- **THEN** every other participant sees classic dice, and nothing about the look was sent anywhere
