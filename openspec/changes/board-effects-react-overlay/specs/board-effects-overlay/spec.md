## ADDED Requirements

### Requirement: Effects render in a React overlay above the board
Attack animations and condition effects SHALL be drawn by a React overlay layered above the board canvas, positioned from the board's current zoom, pan and token positions. The overlay SHALL NOT read or modify Pixi objects. A token's own art changes (tilt, squash, greyscale, alpha, tremble) MAY remain on the board canvas.

#### Scenario: Effect follows zoom and pan
- **WHEN** a hit effect is playing on a token and the viewer zooms or pans
- **THEN** the effect stays on that token at the matching size

#### Scenario: Effect follows a moving token
- **WHEN** a token with a condition effect is dragged
- **THEN** its effect moves with it

### Requirement: Flashy attack effects
A live attack roll SHALL play a glowing projectile with a fading trail from the attacker to the target, followed by an impact burst of particles on the target. A Hit ruling SHALL show a bright flash, an expanding ring and sparks on the target. A Miss ruling SHALL show a whiff effect with a "Miss" label that is visibly different from Hit. Applied damage SHALL show an outlined "−N" that pops and rises from the target. Clearing a ruling SHALL play nothing, and loading or resyncing SHALL NOT replay past effects.

#### Scenario: Strike then impact
- **WHEN** a viewer who can see both tokens receives an attack roll
- **THEN** a projectile with a trail travels from attacker to target and an impact burst plays on the target

#### Scenario: Hit and miss differ
- **WHEN** the GM rules one roll Hit and another Miss
- **THEN** the Hit shows flash, ring and sparks and the Miss shows the whiff and "Miss" label

#### Scenario: Damage number
- **WHEN** the GM applies 7 damage to a visible token
- **THEN** "−7" pops and rises from it and fades out

### Requirement: Particle condition effects
Each of the 12 conditions SHALL keep exactly one fixed effect, drawn with particles or motion in the overlay for as long as the condition is set and removed when it is cleared. Poisoned SHALL show rising green bubbles with a toxic glow. The effects SHALL stay distinct per condition, the condition shape and abbreviation badges (FR-TAC-08) SHALL be unchanged, and colour and motion SHALL be decoration only.

#### Scenario: Poison bubbles
- **WHEN** a visible token is Poisoned
- **THEN** green bubbles rise from it until the condition is cleared, and the PO badge still shows

### Requirement: Overlay never reveals hidden tokens
The overlay SHALL only draw effects the viewer's own filtered state allows. No effect SHALL play, and no particle emitter SHALL exist, for a token hidden from the viewer, and nothing drawn SHALL reveal a hidden token's position.

#### Scenario: Hidden target
- **WHEN** the GM rules a public roll against a token hidden from players a Hit
- **THEN** players see no effect anywhere on the board

#### Scenario: Token hidden mid-effect
- **WHEN** the GM hides a token while its condition effect is showing
- **THEN** players' overlays remove that effect

### Requirement: Overlay is input-transparent
The overlay SHALL NOT receive pointer, touch or keyboard focus, and SHALL NOT delay or block clicks, drags, pans or zooms. It SHALL be hidden from assistive technology, since the activity log and badges carry the same information. Effects SHALL NOT change any token's recorded position.

#### Scenario: Click through
- **WHEN** a player clicks a token while effects play over it
- **THEN** the token is selected as without effects

### Requirement: Reduced motion
When the viewer prefers reduced motion, the overlay SHALL NOT run particles, projectiles or loops. An attack SHALL show a brief static marker on the target, Hit, Miss and damage SHALL show short-lived static indicators, and condition effects SHALL be a static decoration.

#### Scenario: Reduced motion attack
- **WHEN** a viewer with reduced motion enabled sees an attack roll
- **THEN** nothing travels and a static marker briefly appears on the target

### Requirement: Effect budget
At most 8 attack effects SHALL play at once (the oldest is dropped) and at most 12 tokens SHALL show condition particles at once, nearest the view centre first. Particle canvases SHALL be small and per token. The overlay SHALL stop its animation loops when the page is hidden or when no effect is visible, and the page SHALL still paint and accept input before the overlay's code has loaded.

#### Scenario: Many effects
- **WHEN** nine attack effects start within one second
- **THEN** only the eight newest play

#### Scenario: Hidden tab
- **WHEN** the browser tab is hidden
- **THEN** the overlay stops animating until it is shown again
