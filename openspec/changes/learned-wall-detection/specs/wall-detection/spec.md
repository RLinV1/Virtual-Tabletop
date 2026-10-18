# Spec Delta

## Purpose

Automatic wall detection finds most of a map's walls, at any angle, without duplicates.

## ADDED Requirements

### Requirement: Automatic detection uses a trained model
Automatic detection (no style, no sampled wall, no strictness) SHALL run the trained wall model shipped with the vision service, and trace its prediction into wall segments at any angle. When the model file is missing, automatic detection SHALL fall back to the rule-based pipeline.

#### Scenario: A painted map
- **WHEN** the GM detects walls automatically on a painted map with the room's grid set
- **THEN** the walls follow the drawn walls, including diagonal, curved and broken ones

#### Scenario: No model installed
- **WHEN** the vision service runs without `models/walls.onnx`
- **THEN** automatic detection returns the rule-based pipeline's result

### Requirement: Detection never returns duplicate walls
Wall detection SHALL drop any segment that lies within a quarter of a cell of a longer segment at nearly the same angle along most of its length.

#### Scenario: A thick wall
- **WHEN** detection traces a wall drawn thicker than a cell
- **THEN** the result holds one wall along it, not two overlapping ones

### Requirement: The GM's explicit choices keep the rule-based pipeline
Detection with a sampled wall ("Detect like this"), a wall style, or a strictness SHALL run the rule-based pipeline as before.

#### Scenario: Detect like this
- **WHEN** the GM clicks a wall with Detect like this
- **THEN** detection uses that wall's colour, not the model
