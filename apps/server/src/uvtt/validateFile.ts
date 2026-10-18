import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { bitmapFormat, hasPngAnimation } from "./imageValidation";
import {
  MAX_UVTT_BYTES, MAX_UVTT_EDGE, MAX_UVTT_IMAGE_BYTES, MAX_UVTT_PIXELS,
  normalizeUvtt, parseUvtt, uvttError, type GridSpec,
} from "@vtt/shared";

/** Runs in an isolated, time-bounded worker. Image headers alone are never sufficient. */
export async function validateUvttFile(filename: string, inheritedGrid: GridSpec) {
  if ((await stat(filename)).size > MAX_UVTT_BYTES) uvttError("container_limit", "file", "UVTT files must be 40 MiB or smaller.");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readFile(filename))) as unknown; }
  catch { uvttError("invalid_json", "file", "Use a valid UTF-8 JSON UVTT file."); }
  const file = parseUvtt(value);
  const encoded = file.image;
  const padding = encoded.indexOf("=");
  if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded) || (padding !== -1 && (padding < encoded.length - 2 || !/^={1,2}$/.test(encoded.slice(padding))))) {
    uvttError("invalid_base64", "image", "Image must be canonical base64 PNG or WebP bytes.");
  }
  const image = Buffer.from(encoded, "base64");
  if (image.toString("base64") !== encoded) uvttError("invalid_base64", "image", "Image base64 padding is invalid.");
  if (image.length > MAX_UVTT_IMAGE_BYTES) uvttError("image_limit", "image", "Decoded image must be 25 MiB or smaller.");
  if (!["png", "webp"].includes(bitmapFormat(image) ?? "")) uvttError("image_type", "image", "UVTT images must be PNG or WebP.");
  if (hasPngAnimation(image)) uvttError("animated_image", "image", "Use a single-frame image.");
  let width: number, height: number, contentType: "image/png" | "image/webp";
  try {
    const decoder = sharp(image, { limitInputPixels: MAX_UVTT_PIXELS, failOn: "warning", animated: true });
    const metadata = await decoder.metadata();
    if (metadata.format !== "png" && metadata.format !== "webp") uvttError("image_type", "image", "UVTT images must be PNG or WebP.");
    if ((metadata.pages ?? 1) !== 1) uvttError("animated_image", "image", "Use a single-frame image.");
    width = metadata.width!; height = metadata.height!;
    if (!width || !height || width > MAX_UVTT_EDGE || height > MAX_UVTT_EDGE || width * height > MAX_UVTT_PIXELS) {
      uvttError("image_dimensions", "image", "Image must be at most 32 megapixels and 16384 pixels per edge.");
    }
    // Forces complete decoding; truncated pixel data must not become an asset.
    await decoder.raw().toBuffer();
    contentType = metadata.format === "png" ? "image/png" : "image/webp";
  } catch (err) {
    if (err instanceof Error && "issues" in err) throw err;
    uvttError("corrupt_image", "image", "Image cannot be fully decoded within the image limits.");
  }
  const resolution = file.resolution;
  if (Math.abs(width - resolution.map_size.x * resolution.pixels_per_grid) > 1 || Math.abs(height - resolution.map_size.y * resolution.pixels_per_grid) > 1) {
    uvttError("image_mismatch", "resolution.map_size", "Image dimensions do not match map size × pixels per grid (one pixel rounding allowed).");
  }
  const normalized = normalizeUvtt(file, { width, height }, inheritedGrid);
  return { ...normalized, width, height, contentType, image: new Uint8Array(image) };
}
export type ValidatedUvttFile = Awaited<ReturnType<typeof validateUvttFile>>;
