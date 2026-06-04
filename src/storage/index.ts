import { promises as fs } from "node:fs";
import path from "node:path";
import { features } from "@/lib/env";

/**
 * Object storage abstraction. Uses Google Cloud Storage (Firebase Storage
 * bucket) when configured; otherwise falls back to the local filesystem (under
 * .data/blob) so the app can run with no cloud storage — handy for local dev.
 */

export function usingCloud(): boolean {
  return features.hasCloudStorage();
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
  if (usingCloud()) {
    const b = await bucket();
    await b.file(key).save(toBuffer(body), { contentType, resumable: false });
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, toBuffer(body));
  if (contentType) await fs.writeFile(`${file}.meta`, contentType, "utf8").catch(() => {});
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (usingCloud()) {
    const b = await bucket();
    const [buf] = await b.file(key).download();
    return buf;
  }
  return fs.readFile(path.join(LOCAL_DIR, key));
}

export async function getContentType(key: string): Promise<string | undefined> {
  if (usingCloud()) return undefined;
  return fs.readFile(`${path.join(LOCAL_DIR, key)}.meta`, "utf8").catch(() => undefined);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    if (usingCloud()) {
      const b = await bucket();
      const [exists] = await b.file(key).exists();
      return exists;
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
  if (usingCloud()) {
    const b = await bucket();
    const [url] = await b.file(key).getSignedUrl({
      action: "read",
      expires: Date.now() + (opts.expiresIn ?? 3600) * 1000,
      ...(opts.download ? { responseDisposition: "attachment" } : {}),
    });
    return url;
  }
  return `/api/blob/${key.split("/").map(encodeURIComponent).join("/")}`;
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
