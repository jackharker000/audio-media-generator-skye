import { promises as fs } from "node:fs";
import path from "node:path";
import { env, features } from "@/lib/env";

/**
 * Object storage abstraction. Uses Cloudflare R2 when configured; otherwise
 * falls back to the local filesystem (under .data/blob) so the whole app can
 * run with no cloud storage account — handy for the free/local path.
 */

export function usingR2(): boolean {
  return features.hasR2();
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "blob");

// ---- R2 backend (lazy) ----------------------------------------------------

let _s3: import("@aws-sdk/client-s3").S3Client | null = null;
async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const r = env.r2();
  _s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${r.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r.accessKeyId!, secretAccessKey: r.secretAccessKey! },
  });
  return _s3;
}

// ---- Public API -----------------------------------------------------------

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  if (usingR2()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: env.r2().bucket,
        Key: key,
        Body: typeof body === "string" ? Buffer.from(body) : body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof body === "string" ? Buffer.from(body) : Buffer.from(body));
  if (contentType) {
    await fs.writeFile(`${file}.meta`, contentType, "utf8").catch(() => {});
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (usingR2()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3();
    const res = await client.send(new GetObjectCommand({ Bucket: env.r2().bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export async function getContentType(key: string): Promise<string | undefined> {
  if (usingR2()) return undefined;
  return fs.readFile(`${path.join(LOCAL_DIR, key)}.meta`, "utf8").catch(() => undefined);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    if (usingR2()) {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = await s3();
      await client.send(new HeadObjectCommand({ Bucket: env.r2().bucket, Key: key }));
      return true;
    }
    await fs.access(path.join(LOCAL_DIR, key));
    return true;
  } catch {
    return false;
  }
}

/** A URL the browser can use to stream/download this object. */
export async function getReadUrl(
  key: string,
  opts: { expiresIn?: number; download?: boolean } = {},
): Promise<string> {
  if (usingR2()) {
    const r = env.r2();
    if (r.publicBaseUrl) return `${r.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await s3();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: r.bucket, Key: key }),
      { expiresIn: opts.expiresIn ?? 3600 },
    );
  }
  // Local backend: serve through our own route.
  return `/api/blob/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Download an external URL (e.g. fal-hosted audio) into our storage. */
export async function fetchExternalToBlob(
  url: string,
  key: string,
  contentType = "audio/mpeg",
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await putObject(key, buf, res.headers.get("content-type") ?? contentType);
}
