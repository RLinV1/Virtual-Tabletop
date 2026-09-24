# Tasks

## 1. Manual grid draft

- [x] 1.1 Keep editable grid values as strings and validate positive size and units plus canonical offsets in `gridDraft.ts`; verify the form can hold an empty field and `npm run typecheck` passes.
- [x] 1.2 Put the correction form, one- and five-pixel nudges, manual-confidence label and validation message in Battle map → Adjust grid; verify the controls are present in `GmPanel.tsx` and `npm run lint` passes.

## 2. Private preview and application

- [x] 2.1 Share draft state between the modal and board, clear it on dismissal or scene change, and keep the preview GM-only; verify the flow in `RoomPage.tsx` and `npm run typecheck` passes.
- [x] 2.2 Draw a visually distinct grid and unapplied label without changing token layout, including the missing-map fallback and a line-count guard; verify `npm run build` passes.
- [x] 2.3 Submit only a valid changed grid through `scene.setGrid`, close on success and show a rejection in the modal; verify the existing shared/server tests and `npm run typecheck` pass.

## 3. Browser acceptance

- [ ] 3.1 In separate GM and player browser sessions, edit a grid and verify that only the GM sees the draft while both clients retain the accepted grid and token positions until Apply; confirm one accepted change reaches both after Apply.
- [ ] 3.2 In a GM browser session, verify blank and out-of-range fields disable Apply, a last valid preview remains visible, and Cancel, Escape, close button and backdrop discard the preview with no command; verify a rejected Apply keeps the modal open with an error.
- [ ] 3.3 At 320px and 390px widths, verify the Adjust grid modal remains usable and the preview can be inspected; record any mobile visibility limitation for the team review.
