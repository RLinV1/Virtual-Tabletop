# Spec Delta

## MODIFIED Requirements

### Requirement: Creature ownership and access
Every creature SHALL belong to exactly one owner: the account that created it, or a legacy GM device identity that created it before accounts existed. All creature endpoints SHALL be GM-only and MUST authorize on the server. Creating a creature SHALL require a signed-in account, and the new creature SHALL be owned by that account. An owner MUST NOT be able to list, read, edit or delete another owner's creatures. Nothing sent to player clients SHALL include a creature's id or reveal which creatures a GM has.

#### Scenario: Another GM's creature
- **WHEN** GM B edits or deletes a creature owned by GM A
- **THEN** the server responds 404 and the creature is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a creature endpoint carries only a room guest credential
- **THEN** the server responds 401

#### Scenario: Creating without an account
- **WHEN** a request to create a creature carries no session, with or without a legacy GM token
- **THEN** the server responds 401 and no creature is created
