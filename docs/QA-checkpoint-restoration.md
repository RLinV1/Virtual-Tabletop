# Checkpoint restoration browser regression

Verified with Playwright and headless Microsoft Edge on 2026-10-18, against an isolated in-memory
server and the current web client (no production/user rooms involved).

1. Create a GM room and place the packaged The Broken Span map.
2. Save a checkpoint named Visible map through Manage > Checkpoints.
3. Capture the live board, then change its map to Hollowfrost Keep.
4. Open Restore Visible map and verify the checkpoint preview draws the original map.
5. Confirm Restore and verify the live board draws The Broken Span.
6. Repeat preview and restore three more times.

Before the cleanup fix, step 5 rendered a black board and raised
`Cannot read properties of null (reading 'ids')` inside Pixi's batch texture lookup.
The earlier grid-background cache fix alone did not resolve this preview-close failure.

After the cleanup fix, all four restorations pass with zero browser page errors.
Interior map pixels after the first and fourth restores match the original screenshot exactly
(mean RGB difference 0.0 in each channel, excluding surrounding UI).

## Cause

Pixi 8's `Application.destroy(true, ...)` also releases global rendering pools. A checkpoint
preview is a second renderer beside the live board, so destroying it this way invalidates
resources still used by the live board. Boards, animation previews and thumbnails now remove
their own view and children with explicit renderer options and `releaseGlobalResources: false`.
Their per-renderer resources are still destroyed normally.
