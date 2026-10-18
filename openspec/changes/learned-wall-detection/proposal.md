## Why

Automatic wall detection misses most walls and invents others. Scored against 134 maps whose walls were drawn by their authors (Foundry VTT scenes and Universal VTT files), the current detector finds 33% of the true wall length, and 51% of what it draws is on a real wall. It also returns overlapping duplicate walls. GMs end up clearing the result and drawing walls by hand.

The detector is a hand-written filter: a light or dark band thinner than a cell and a half, with an outlined edge, kept only as long horizontal and vertical runs. Painted maps break each assumption: wall stone is the floor's colour, ruined walls have gaps, towers are round, and stair treads look like walls. Four rule-based fixes were tried (choosing the wall colour automatically, tracing the floor's outline, classifying grid cells as floor, and porting foundry-auto-wall's tracing). None got painted maps past about 65%.

## What Changes

- **A small trained model finds walls.** A U-Net (about 2 M parameters, an 8 MB ONNX file) predicts, per pixel, whether a pixel lies on a wall. `walls.py` thins and traces the prediction into segments at any angle. OpenCV runs the model (`cv2.dnn`), so the vision service gains no dependency, and it runs on CPU.
- **Automatic detection uses it.** With no style, no sampled wall and no strictness set, detection runs the model. If the model file is missing, detection falls back to the current pipeline unchanged.
- **The GM's other choices are unchanged.** "Detect like this" (a sampled wall colour), the Light stone, Dark ink and Inked outlines styles, and strictness all still run the rule-based pipeline.
- **No duplicate walls.** A final pass drops any segment lying along a longer one within a quarter cell.
- **Training is offline and reproducible.** `services/vision/training/` holds the training script and the list of source maps. The labelled maps and the training library are not committed and do not ship.

## Non-goals

- No change to commands, events, state or visibility. The result shape (`WallDetectionResult`) is unchanged.
- Doors and windows are still not told apart from walls (FR-GM-18).
- No GPU and no training in production.

## Capabilities

### Modified Capabilities
- `wall-detection`: automatic detection uses a trained model, with the rule-based pipeline as fallback.

## Impact

- `services/vision`: `walls.py` gains the model path and the duplicate pass; new `models/walls.onnx`; new `training/` (script, source list, README); Dockerfile copies the model; tests in `test_walls.py`.
- `docs/adr/0029-walls-and-wall-detection.md`: amendment for the learned detector.
- `docs/WALL-DETECTION.md`: what it finds and its limits.
