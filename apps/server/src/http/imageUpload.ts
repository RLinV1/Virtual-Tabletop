import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { Request, Response } from "express";
import multer from "multer";

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export type ImageUploadResult =
  | { ok: true; file: Express.Multer.File }
  | { ok: false; status: 413 | 415 | 400; error: string };

/**
 * One multipart image, validated by MIME type and size before it reaches object storage
 * (DESIGN.md §6). Files get a random name, so an object key never carries the uploader's
 * filename (asset-library: object name reveals nothing).
 */
export function imageUploader(uploadDir: string) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        void mkdir(uploadDir, { recursive: true }).then(
          () => cb(null, uploadDir),
          (err: Error) => cb(err, uploadDir),
        );
      },
      filename: (_req, file, cb) => cb(null, `${randomUUID()}${IMAGE_TYPES[file.mimetype] ?? ""}`),
    }),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
  }).single("file");

  /** Runs multer and turns its errors into a status instead of an unhandled 500. */
  return (req: Request, res: Response) =>
    new Promise<ImageUploadResult>((resolve) => {
      upload(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          return resolve(
            err.code === "LIMIT_FILE_SIZE"
              ? { ok: false, status: 413, error: "Images must be 25 MB or smaller" }
              : { ok: false, status: 400, error: err.message },
          );
        }
        if (err) return resolve({ ok: false, status: 400, error: "Upload failed" });
        if (!req.file) return resolve({ ok: false, status: 415, error: "Use PNG, JPEG or WebP" });
        resolve({ ok: true, file: req.file });
      });
    });
}
