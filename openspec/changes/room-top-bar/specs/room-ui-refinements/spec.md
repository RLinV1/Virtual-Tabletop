## ADDED Requirements

### Requirement: The room has a top bar with people and panel tabs
The room page SHALL show a top bar with:
- the room name;
- the active participants as coloured initials in its centre, showing at most five and then a "+N" circle, and opening the participants list when pressed;
- the panel tabs (Play, Tokens, Dice, and Manage for the GM) on the right, each with its own icon.

The sidebar SHALL show only the selected tab's sections. Pressing the selected tab SHALL hide the sidebar, and pressing a tab while it is hidden SHALL show it on that tab. The selected tab SHALL be remembered in this browser.

#### Scenario: Seven people in the room
- **WHEN** seven participants are active
- **THEN** the top bar shows five initials and a "+2" circle, centred

#### Scenario: Reselecting a tab hides the sidebar
- **WHEN** the Manage tab is open and the GM presses Manage again
- **THEN** the sidebar hides, and pressing Tokens shows it on the Tokens tab

### Requirement: The sidebar hides and shows without delay
Hiding or showing the sidebar SHALL resize the board within a couple of frames, without a sliding animation.

#### Scenario: Hiding the sidebar
- **WHEN** the viewer hides the sidebar
- **THEN** the board fills the freed width by the second frame after the press

### Requirement: The guided tour covers every tab
A guided-tour step about a section on a tab other than the selected one SHALL switch the sidebar to that tab before highlighting the section, instead of being skipped.

#### Scenario: Dice step
- **WHEN** the tour reaches the Dice step while the Play tab is open
- **THEN** the sidebar switches to the Dice tab and the dice section is highlighted
