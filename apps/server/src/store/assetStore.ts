import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Where uploaded map and token images live (DESIGN.md §3).
 *
 * Images do not belong in Postgres, so they go to object storage. MinIO speaks the S3
 * API, so local dev and the deploy target run the same code path — and a checkout with
 * no MinIO running still works, on local disk.
 */
export interface AssetStore {
  /** Moves a temporary upload into storage and returns the URL clients should use. */
  put(tempPath: string, filename: string, contentType: string): Promise<string>;
}

/** Fallback for `pnpm dev` and CI with no containers running. Served by express.static. */
export class LocalDiskAssetStore implements AssetStore {
  constructor(private uploadDir: string) {}

  async put(tempPath: string, filename: string): Promise<string> {
    await mkdir(this.uploadDir, { recursive: true });
    // multer already wrote the file into uploadDir; just confirm and address it.
    await stat(tempPath);
    return `/uploads/${filename}`;
  }
}

export class MinioAssetStore implements AssetStore {
  private constructor(
    private s3: S3Client,
    private bucket: string,
    private publicBase: string,
  ) {}

  static async connect(opts: {
    endpoint: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    publicBase?: string;
  }): Promise<MinioAssetStore> {
    const bucket = opts.bucket ?? "vtt-assets";
    const s3 = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region ?? "us-east-1",
      // MinIO serves buckets as a path, not a subdomain.
      forcePathStyle: true,
      credentials: {
        accessKeyId: opts.accessKeyId ?? "vtt",
        secretAccessKey: opts.secretAccessKey ?? "vttvttvtt",
      },
    });

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }

    const publicBase = opts.publicBase ?? `${opts.endpoint.replace(/\/$/, "")}/${bucket}`;
    return new MinioAssetStore(s3, bucket, publicBase);
  }

  async put(tempPath: string, filename: string, contentType: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: filename,
        Body: createReadStream(tempPath),
        ContentType: contentType,
        ContentLength: (await stat(tempPath)).size,
      }),
    );
    return `${this.publicBase}/${filename}`;
  }
}

/** MinIO when MINIO_ENDPOINT is set, local disk otherwise. */
export async function createAssetStore(uploadDir: string): Promise<AssetStore> {
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint) {
    console.log("[vtt] MINIO_ENDPOINT unset — storing uploads on local disk");
    return new LocalDiskAssetStore(uploadDir);
  }
  const store = await MinioAssetStore.connect({
    endpoint,
    bucket: process.env.MINIO_BUCKET,
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
    publicBase: process.env.MINIO_PUBLIC_BASE,
  });
  console.log(`[vtt] storing uploads in MinIO at ${endpoint}`);
  return store;
}

export const assetPath = (uploadDir: string, filename: string) => path.join(uploadDir, filename);
