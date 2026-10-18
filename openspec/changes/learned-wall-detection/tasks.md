## 1. Evaluate

- [x] 1.1 Score the current detector against author-labelled maps (recall, precision, duplicates).
- [x] 1.2 Try rule-based fixes (automatic wall colour, floor outline, grid-cell floor, foundry-auto-wall tracing); record results in design.md.

## 2. Train

- [ ] 2.1 `services/vision/training/`: training script, source list, README; train on the labelled maps with a held-out test set.
- [ ] 2.2 Export `models/walls.onnx`; check `cv2.dnn` output matches training-time output.

## 3. Implement

- [ ] 3.1 `walls.py`: run the model for automatic detection, trace at any angle, fall back when the model is missing.
- [ ] 3.2 Duplicate pass on every pipeline's output.
- [ ] 3.3 Dockerfile copies the model; ADR 0029 amendment; WALL-DETECTION.md.

## 4. Verify

- [ ] 4.1 Python tests: the model path on a synthetic map, the fallback without a model, no duplicates.
- [ ] 4.2 Held-out maps reach at least 90% recall and precision; record per-map scores in design.md.
- [ ] 4.3 `npm run lint && npm run typecheck && npm test` and the vision tests.
- [ ] 4.4 In the running app: Detect walls on a bundled painted map.
