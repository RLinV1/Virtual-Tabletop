## MODIFIED Requirements

### Requirement: Creature form advanced settings
The creature form (New creature, Edit creature and Save as creature) SHALL show the name, Size, Max HP, AC, attacks and image directly. Starting HP with its blank-means-Max-HP hint, Colour without art, and the starting conditions SHALL be inside a collapsible "Advanced settings" section placed after the image and before the form's buttons. The starting conditions SHALL be shown directly in that section under a "Starting conditions" label, with no collapsible section of their own, so they are visible whenever Advanced settings is open. Advanced settings SHALL be open when the form opens with a Starting HP value or at least one condition, and SHALL open when the Starting HP error is shown. Otherwise it SHALL start closed. It SHALL NOT close on its own while the form is open. The form SHALL NOT show the text "Without art it shows as a colour disc." or "Named to-hit and damage rolls are copied to each placed token." Moving fields into the section SHALL NOT change what is saved.

#### Scenario: New creature starts tidy
- **WHEN** the GM opens New creature
- **THEN** Size, Max HP and AC are shown, Advanced settings is closed, and neither removed hint text appears

#### Scenario: Values already set are not hidden
- **WHEN** the GM saves a token at 30 of 59 HP that is prone as a creature, or edits a creature with a Starting HP or conditions
- **THEN** Advanced settings is open, Starting HP shows its value, and the Starting conditions picker is shown with Prone checked

#### Scenario: Conditions open and close with Advanced settings
- **WHEN** the GM opens Advanced settings on a new creature
- **THEN** the Starting conditions picker is shown with no further section to open, and closing Advanced settings hides it again

#### Scenario: The Starting HP error is never hidden
- **WHEN** the GM enters a Starting HP higher than Max HP while Advanced settings is closed
- **THEN** Advanced settings opens so the field is visible next to "Starting HP cannot exceed Max HP."

#### Scenario: Clearing a value does not collapse the section
- **WHEN** Advanced settings opened because Starting HP had a value and the GM clears Starting HP
- **THEN** Advanced settings stays open

#### Scenario: Saved values are unchanged
- **WHEN** the GM creates a creature with Starting HP 20, a colour and the Prone condition set under Advanced settings
- **THEN** the creature is saved with those values, exactly as before the change
