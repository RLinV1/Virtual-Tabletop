# Complete exporter fixtures

These are losslessly gzipped originals; tests decompress and upload the complete JSON and image. No images are substituted or geometry edited.

| File | Exporter / format | Provenance | SHA-256 of decompressed file |
|---|---|---|---|
| arkenforge-tavern.uvtt.gz | Arkenforge, format 1.0; application version absent | Nathan's public sample linked by https://arkenforge.com/universal-vtt-files/ (The Pig and Whistle tavern), downloaded 2026-10-10 from https://www.dropbox.com/s/s494c3l6bnblmbu/The%20Pig%20and%20Whistle%20tavern.uvtt?dl=1 | 6dc29a43add7d67634c0d4b32cfed7857ecc172fb7c00e8d6d3cf010a62ad9bf |
| dungeondraft-test.dd2vtt.gz | Dungeondraft test export, format 0.3; application version absent | Public importer test from https://github.com/oganm/dd2vtt_importer/blob/master/test.dd2vtt, downloaded 2026-10-10 | 31f1dbff6106c990891fca2f7d64d20fac813a66299a3870b9e6782115f59afe |

Direct JSON inspection gives Arkenforge 32×22 squares at 120 px (3840×2640), 58 object polylines and 12 portals; first bounds (4.391566,21.11163)→(5.729012,21.10521), independent position (1.337447,0.006420135), closed true, freestanding false, rotation 0. Dungeondraft gives 20×20 squares at 64 px (1280×1280), 9 ordinary and 2 object polylines and 3 portals; first bounds (11,6)→(12,6), position (11.5,6), closed true, freestanding false, rotation 0. Expected selected coordinates in tests are direct multiplication of these literals, not parser-produced fixtures.

Qualification still needs an independent human geometry/provenance review and exporter application versions. Public test distribution does not establish ownership of artwork. Keep this review gate open; do not claim a licensed consumer run from these files. Cropped/negative origins, PNG/WebP, open/freestanding portals and malformed cases are explicitly synthetic mutations of controlled test data. Original exports remain untouched.

Strict-validation finding: the unmodified Arkenforge sample contains consecutive duplicate points in objects_line_of_sight. Under the agreed nonzero-segment policy it is a complete real rejection fixture, not a passing interoperability fixture. A clean original Arkenforge export is still a release qualification gate.
