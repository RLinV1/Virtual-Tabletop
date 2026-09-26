## MODIFIED Requirements

### Requirement: GM dashboard
The app SHALL provide a GM dashboard at `/gm-dashboard`. It SHALL offer a form to create a room (room name and the GM's display name). It SHALL list the rooms this browser's GM identity owns, with each room's name, when it was last active, an Open action and a Delete action. It SHALL link to the asset library and show the account menu. It SHALL state that the rooms it lists are saved in this browser. Delete SHALL first ask for confirmation. The confirmation SHALL name the room and state that the room and everything in it will be permanently deleted and cannot be undone. Nothing SHALL be deleted unless the GM confirms.

#### Scenario: Returning GM finds their rooms
- **WHEN** a browser whose GM identity owns rooms opens the dashboard
- **THEN** each room is listed with its name and last activity, newest activity first, and Open takes the GM into that room

#### Scenario: No rooms yet
- **WHEN** a recognised browser with no GM identity, or whose identity owns no rooms, opens the dashboard
- **THEN** an empty state invites the GM to create their first room, and no request for rooms is made when there is no GM identity

#### Scenario: Creating a room from the dashboard
- **WHEN** a GM submits a room name and their display name on the dashboard
- **THEN** the room is created, owned by this browser's GM identity (created now if there was none), and the GM is taken into it

#### Scenario: Room list cannot be loaded
- **WHEN** the rooms request fails
- **THEN** the dashboard still offers room creation and the library link, and shows that the room list could not be loaded

#### Scenario: Deleting a room from the dashboard
- **WHEN** a GM chooses Delete on the room "Goblin Cave" and confirms
- **THEN** the room is deleted and "Goblin Cave" disappears from the list without a page reload. If it was the last room, the empty state is shown

#### Scenario: Cancelling a delete
- **WHEN** a GM chooses Delete on a room and then cancels the confirmation
- **THEN** no request is sent and the room stays in the list

#### Scenario: Delete fails
- **WHEN** the delete request fails
- **THEN** the room stays in the list and the dashboard says the room could not be deleted
