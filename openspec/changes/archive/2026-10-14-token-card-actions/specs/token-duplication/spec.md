## ADDED Requirements

### Requirement: Duplicate is offered wherever the GM finds a token
Duplicate SHALL be offered in three places: the token editor, each row of the sidebar's token list, and the card that opens when a token is selected on the board. Every one of them SHALL be labelled "Duplicate". Pressing any of them SHALL start placing copies of that token, exactly as the editor's Duplicate does. Duplicate SHALL be shown only to the GM, including on hidden tokens, and SHALL NOT be shown to a player, even on a token they own.

#### Scenario: Duplicate from the token list
- **WHEN** the GM presses Duplicate on the "Goblin" row in the sidebar's token list and clicks two empty squares
- **THEN** "Goblin 2" and "Goblin 3" are created on those squares, and the board is still placing copies of Goblin

#### Scenario: Duplicate from the board card
- **WHEN** the GM clicks "Goblin" on the board, presses Duplicate on its card, and clicks an empty square
- **THEN** "Goblin 2" is created on that square, and the board is still placing copies of Goblin

#### Scenario: Ending placement
- **WHEN** the GM presses Duplicate on a roster row, places one copy, and presses Esc
- **THEN** placing ends with the one copy kept and no more created

#### Scenario: Not for players
- **WHEN** a player views the token list and selects their own token on the board
- **THEN** neither the row nor the card shows Duplicate

### Requirement: The board token card offers Edit
The card that opens when a token is selected on the board SHALL show an Edit button to the GM and to the token's owners, and SHALL NOT show it to any other player. Edit SHALL open the same token editor as the sidebar's token list. The sidebar SHALL switch to the Tokens tab to show it, opening first if it is collapsed. Edits SHALL be sent only when saved in the editor, as with the token list's Edit.

#### Scenario: GM edits from the board
- **WHEN** the GM, with the sidebar on the Play tab, selects "Goblin" on the board and presses Edit on its card
- **THEN** the sidebar shows the Tokens tab with the "Edit Goblin" editor open

#### Scenario: Collapsed sidebar
- **WHEN** the GM has hidden the sidebar and presses Edit on a token's card
- **THEN** the sidebar opens on the Tokens tab with that token's editor open

#### Scenario: Owner edits their token
- **WHEN** a player selects a token they own on the board
- **THEN** its card shows Edit and not Duplicate

#### Scenario: Someone else's token
- **WHEN** a player selects a token they do not own
- **THEN** its card shows neither Edit nor Duplicate

#### Scenario: Token removed while editing
- **WHEN** the token being edited is deleted by another client
- **THEN** the editor closes and nothing is sent
