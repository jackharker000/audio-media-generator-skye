import { promises as fs } from "node:fs";
import path from "node:path";
import { features, optionalEnv } from "@/lib/env";
import { blobExists, deleteBlob, getBlob, getBlobContentType, putBlob } from "./firestoreBlob";

/**
 * Object storage abstraction with three backends, chosen automatically:
 *   - "gcs":       Google Cloud Storage (Firebase) — when a bucket is set.
 *   - "firestore": store blobs in Firestore — when a service account is set but
 *                  no bucket (no Cloud Storage / Blaze plan needed).
 *   - "local":     local filesystem (.data/blob) — for dev with no Google creds.
 * Override with STORAGE_BACKEND=gcs|firestore|local.
 */
export type StorageBackend = "gcs" | "firestore" | "local";

export function storageBackend(): StorageBackend {
  const override = optionalEnv("STORAGE_BACKEND");
  if (override === "gcs" || override === "firestore" || override === "local") return override;
  if (features.hasCloudStorage()) return "gcs";
  if (features.hasFirebase()) return "firestore";
  return "local";
}

/** GCS issues its own signed URLs; the other backends are served via /api/blob. */
export function usingCloud(): boolean {
  return storageBackend() === "gcs";
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "blob");

async function bucket() {
  const { getBucket } = await import("@/lib/firebase");
  return getBucket();
}

function toBuffer(body: Buffer | Uint8Array | string): Buffer {
  return typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<void> {
  const backend = storageBackend();
  if (backend === "gcs") {
    const b = await bucket();
    await b.file(key).save(toBuffer(body), { contentType, resumable: false });
    return;
  }
  if (backend === "firestore") {
    await putBlob(key, toBuffer(body), contentType);
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, toBuffer(body));
  if (contentType) await fs.writeFile(`${file}.meta`, contentType, "utf8").catch(() => {});
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const backend = storageBackend();
  if (backend === "gcs") {
    const b = await bucket();
    const [buf] = await b.file(key).download();
    return buf;
  }
  if (backend === "firestore") return getBlob(key);
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export async function getContentType(key: string): Promise<string | undefined> {
  const backend = storageBackend();
  if (backend === "gcs") return undefined;
  if (backend === "firestore") return getBlobContentType(key);
  return fs.readFile(`${path.join(LOCAL_DIR, key)}.meta`, "utf8").catch(() => undefined);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    const backend = storageBackend();
    if (backend === "gcs") {
      const b = await bucket();
      const [exists] = await b.file(key).exists();
      return exists;
    }
    if (backend === "firestore") return blobExists(key);
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
  if (storageBackend() === "gcs") {
    const b = await bucket();
    const [url] = await b.file(key).getSignedUrl({
      action: "read",
      expires: Date.now() + (opts.expiresIn ?? 3600) * 1000,
      ...(opts.download ? { responseDisposition: "attachment" } : {}),
    });
    return url;
  }
  // Firestore / local: served (auth-checked) through our own routes.
  return `/api/blob/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Best-effort delete of an object across whichever backend is active. */
export async function deleteObject(key: string): Promise<void> {
  try {
    const backend = storageBackend();
    if (backend === "gcs") {
      const b = await bucket();
      await b.file(key).delete({ ignoreNotFound: true } as any);
      return;
    }
    if (backend === "firestore") {
      await deleteBlob(key);
      return;
    }
    await fs.unlink(path.join(LOCAL_DIR, key)).catch(() => {});
    await fs.unlink(`${path.join(LOCAL_DIR, key)}.meta`).catch(() => {});
  } catch {
    /* best effort */
  }
}

/** Download an external URL into our storage (kept for completeness). */
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
