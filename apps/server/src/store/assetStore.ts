import { createReadStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
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
  /**
   * Moves a temporary upload into storage and returns the URL clients should use.
   *
   * The URL is always **origin-relative** (`/uploads/<key>`). An absolute one would bake
   * this machine's hostname into the event log, and the log is permanent: a map uploaded
   * as `http://localhost:9000/...` is unreachable from every device except the server's
   * own browser — phones, teammates, and the deployed app all get a broken image.
   */
  put(tempPath: string, filename: string, contentType: string): Promise<string>;
  /**
   * Streams an object back, or null when this store does not serve reads itself
   * (local disk is served by express.static instead).
   */
  read?(key: string): Promise<{ body: Readable; contentType?: string } | null>;
  /**
   * Removes an object for good (library delete, ADR 0004). Missing keys are not an error.
   * Rooms whose event log still names the URL then get a 404 and draw a generic stand-in.
   */
  delete(key: string): Promise<void>;
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

  async delete(key: string) {
    // basename: a key is only ever a bare filename, never a path out of uploadDir.
    await unlink(path.join(this.uploadDir, path.basename(key))).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
}

export class MinioAssetStore implements AssetStore {
  private constructor(
    private s3: S3Client,
    private bucket: string,
  ) {}

  static async connect(opts: {
    endpoint: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
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

    // Buckets are private by default, which would make every returned URL a 403 in the
    // browser. Objects are named by UUID and carry no room data, and DESIGN.md §6 wants
    // them served from an origin separate from the app, so read is public and write is not.
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        }),
      }),
    );

    return new MinioAssetStore(s3, bucket);
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
    // Relative on purpose — see the AssetStore docstring.
    return `/uploads/${filename}`;
  }

  async delete(key: string) {
    // S3 DeleteObject is already idempotent: a missing key succeeds.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async read(key: string) {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) return null;
    return { body: out.Body as Readable, contentType: out.ContentType };
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
  });
  console.log(`[vtt] storing uploads in MinIO at ${endpoint}`);
  return store;
}

export const assetPath = (uploadDir: string, filename: string) => path.join(uploadDir, filename);
