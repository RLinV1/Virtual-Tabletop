## ADDED Requirements

### Requirement: Create-room form starting values
The dashboard's create-room form SHALL NOT show example or placeholder text in its Room name or Your name boxes. Room name SHALL start empty. Your name SHALL start with the signed-in account's display name. The GM SHALL be able to edit or clear that name, and the room SHALL be created with the name in the box when the form is submitted. Editing it there SHALL NOT change the account's display name. The join page's player name box is not covered by this requirement and SHALL stay empty when the page opens, even for a signed-in player.

#### Scenario: Form opens with the account name
- **WHEN** a GM signed in with the display name "Tony" opens the dashboard
- **THEN** the create-room form's Your name box contains "Tony", the Room name box is empty, and neither box shows placeholder text

#### Scenario: GM changes the pre-filled name
- **WHEN** the GM replaces "Tony" with "DM Tony" in Your name, enters a room name and creates the room
- **THEN** the room is created with "DM Tony" as the GM's display name, and the account's display name is still "Tony"

#### Scenario: Cleared name is still required
- **WHEN** the GM clears Your name and tries to create the room
- **THEN** the form does not submit, as before, because the name is required

#### Scenario: Player join form is not pre-filled
- **WHEN** a signed-in player opens a room's invite link and the join form is shown
- **THEN** the player's Your name box is empty
