const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Refuse non-bitmap input before invoking a decoder (including SVG masquerading as PNG). */
export function bitmapFormat(bytes: Uint8Array): "png" | "webp" | "jpeg" | null {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "jpeg";
  return null;
}

/** libvips can expose only APNG's first frame. Inspect its animation chunk as well. */
export function hasPngAnimation(bytes: Uint8Array): boolean {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bitmapFormat(data) !== "png") return false;
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) return false; // Full decoding rejects truncation.
    if (data.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    offset += length + 12;
  }
  return false;
}
