# Design

## Context

See proposal.md for why. What the design had to work with:

- The dice are CSS 3D, not WebGL (`ui/Die3D.tsx`, from `add-3d-dice-animation`).
  - Each face is a flat element placed with `matrix3d`, holding an SVG outline and its numerals.
  - The face's outline is known exactly in its own axes (`Face.polygon` in `ui/diceGeometry.ts`), and its numeral is upright in those axes. The d4 is the exception: it prints three numbers turned toward its corners.
  - Faces are shaded once at rest by painting a darker fill.
- The same `Die3D` draws every die: the centred board throw (`ui/BoardDice.tsx`, from `board-dice-rolls`), dice dropped on the map (`board/ThrownDice.tsx`), the held die (`panels/DiceThrowHandle.tsx`), the panel trays (GM-only rolls) and the home page demo.
- The library page (`pages/LibraryPage.tsx`) is a GM surface behind the entry rule (`gm-dashboard`). Its assets are server-side and GM-owned.
- The first prototype kept one d6 picture in `localStorage` (`vtt.diceSkin.d6`).

## Goals / Non-Goals

**Goals:**
- A picture per die type lands on each face exactly, for any of the six bodies.
- Templates and the mapping come from the same geometry, so they cannot drift apart.
- No contract, server or dependency change.

**Non-Goals:**
- Showing a viewer's look to anyone else. That needs the look to cross the wire, which is the sync work, with an ADR.
- Server storage or sharing looks between devices.
- Moderating uploaded pictures (nobody else sees them).
- Colour-only looks from the proposed JSON format in `docs/DICE-SKINS.md`.

## Decisions

### The picture is clipped to the face, under the painted shading
When the die has a picture, each face's SVG draws the picture inside a group clipped to the face's outline, then the outline on top as a translucent tint:
- black at the face's shade;
- white at 8% on the result face.

The numerals go over both, white with a dark outline so they read on any art.

The clip goes on a wrapping `<g>`, not on the `<image>`. A clip path is read in the user space of the element it is set on, which includes that element's transform, so on the image it shrank and moved with the picture; the first try showed only a speck.

Alternative: a CSS `background-image` per face with `clip-path: polygon()`. It was rejected because the face's SVG already exists and the SVG route keeps the tint and numerals in one place.

### One affine map per face, from the geometry
`templateSpec(body)` fixes, for each body:
- the grid (columns, rows, cell size) on a 1536 × 1024 canvas;
- one scale (canvas px per unit of die radius), chosen so the widest face spans 87.5% of a cell;
- a per-face offset that centres each outline's bounding box in its cell. Centring on the centroid would leave triangles and kites sitting high.

`faceArt(image, body, face)` gives the face centroid's position and the scale in the uploaded picture, scaled if the picture is a multiple of the template. `faceImageTransform` maps the picture onto the face element with `translate · scale · translate`. The face's axes and the cell's are the same (numeral upright), so no rotation is needed.

Tests check, for every body:
- the grid fits the canvas;
- every face has its own cell;
- each outline sits inside its cell, centred;
- every corner of every face lands on the same corner of the rendered face.

Grids: d4 2×2 of 512, d6 3×2 of 512, d8 4×2 of 384, d10 5×2 of 300, d12 4×3 of 340, d20 5×4 of 256. The d6 grid is the prototype's, so its sheets still fit.

Alternative: an unfolded net per die. It was rejected: nets are awkward for d10, d12 and d20, image AIs place separate tiles more reliably, and art can't be seen across edges at these sizes anyway.

### Cells follow the standard numbering
Cell *k* is the face that carries *k* on a standard die. This uses `standardLabels`, now exported from `diceGeometry.ts`, and is `tileForFace` in `diceSkin.ts`. A d3 drawn as a d6 therefore shows the d6's art on its faces. The d4's numbers are at its corners, so its cells are its faces in order, each labelled with its corner numbers.

### One canvas size, and one prompt
Every template is 1536 × 1024, a size image AIs output readily. An upload is therefore:
- **3:2:** a painted template, at any size;
- **1:1:** one picture on every face.

Anything else is refused. The shape decides the mode, so no mode switch is needed.

The template picture carries the grid, numbering and outlines, so one prompt (`DICE_PROMPT`) covers every die, with or without a template. Per-die prompts were tried and dropped: they appeared as a second "copy prompt" beside the texture prompt, and added nothing the template didn't already show.

### Kept as plain pixels in the browser
An upload is decoded with `createImageBitmap`, redrawn on a canvas no larger than it needs to be, and kept as a WebP (or PNG) data URL. Nothing else from the file survives.

Looks are kept in IndexedDB, which has room for several pictures where `localStorage` doesn't. Which look is in use is a `localStorage` value. A `BroadcastChannel` tells other tabs to reload, so a look saved in the library reaches an open room at once. Without IndexedDB, looks last the visit.

The prototype's d6 picture is moved into a look once. The old key is removed before anything waits, so two tabs, or two module loads during a hot reload, can't both move it. The first version removed it afterwards, and a hot reload duplicated the look.

### Drawn for the viewer's own public rolls
Each renderer reads the look in use (`useActiveDiceLook`) and passes it to `Die3D` only for a roll marked `skinned`:
- the viewer's own public roll, in the centred board throw (`ui/BoardDice.tsx` gets `youId`);
- their roll dropped on the map (`board/ThrownDice.tsx`);
- the held die, unless it's GM-only.

The panel trays and the attack card only show GM-only rolls since `board-dice-rolls`, so they never wear a look.

GM-only rolls and other participants' rolls pass nothing and stay classic.

### The Dice tab follows the library's patterns
The tab reuses the library toolbar (search and a primary New action), `asset-card`s with a 4:3 thumbnail, and the inline delete confirm. The editor is a modal like the creature form.

In the editor each die is one card with an **Edit** menu, built on the app's `PopoverButton` (as the Share options menu is). The first version, rows of four buttons per die, repeated the same actions six times. A note over the die's preview confirms an action for four seconds without changing the card's size.

### A player-only entry for dice looks
`LibraryPage` opens `/library?tab=dice` for a browser that isn't recognised. It shows the Dice tab alone, with its own toolbar and no GM tabs. Everything else keeps the sign-in redirect (see the `gm-dashboard` delta).

## Risks / Trade-offs

- **Only the viewer sees their look** → That's the point of this step. Sharing is the sync follow-up.
- **Copying an image to the clipboard isn't available everywhere** (Firefox before 127, some embedded browsers) → The template is saved as a file instead, and the card says so.
- **Busy pictures under the numerals** → The template marks the numeral zones, the prompt asks to keep them calm, and numerals are drawn white with a dark outline.
- **Dark pictures make side faces very dark,** because the tint darkens up to 62% → The shading is left as is for now; lighter shading for picture faces is an easy follow-up if it matters.
- **IndexedDB unavailable** (some private windows) → Looks last the visit; nothing breaks.
- **Many dice with pictures**: each face references the same data URL, which the browser decodes once → The board already caps a throw at 10 dice.

## Migration Plan

Client-only. The prototype's `vtt.diceSkin.d6` picture is moved into a look on first load. Rolling back means reverting the web changes; looks left in IndexedDB are simply unused.

## Open Questions

- Should picture faces use lighter shading than classic ones? This is visual tuning and doesn't change the specs.
