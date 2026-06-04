import { COLLECTIONS, getDb } from "@/db";
import { mapWithConcurrency } from "@/lib/utils";

/**
 * Stores binary objects (generated audio, uploaded files) directly in Firestore
 * so the app needs no Cloud Storage bucket / Blaze plan. Firestore caps a
 * document at ~1 MiB, so each object is split into base64 chunks across a
 * `chunks` subcollection; metadata lives on the parent doc.
 */

const CHUNK_BYTES = 600_000; // base64 of this stays comfortably under 1 MiB

const docId = (key: string) => key.replace(/\//g, "~");
const blobDoc = (key: string) => getDb().collection(COLLECTIONS.blobs).doc(docId(key));

export async function putBlob(key: string, body: Buffer, contentType?: string): Promise<void> {
  const ref = blobDoc(key);
  const chunksCol = ref.collection("chunks");

  // Remove any previous chunks (overwrite).
  const old = await chunksCol.listDocuments();
  await mapWithConcurrency(old, 10, (d) => d.delete());

  const parts: { i: number; data: string }[] = [];
  for (let offset = 0, i = 0; offset < body.length; offset += CHUNK_BYTES, i++) {
    parts.push({ i, data: body.subarray(offset, offset + CHUNK_BYTES).toString("base64") });
  }
  if (parts.length === 0) parts.push({ i: 0, data: "" });

  await mapWithConcurrency(parts, 5, (p) =>
    chunksCol.doc(String(p.i).padStart(6, "0")).set({ i: p.i, data: p.data }),
  );
  await ref.set({
    key,
    contentType: contentType ?? null,
    size: body.length,
    chunkCount: parts.length,
    updatedAt: Date.now(),
  });
}

export async function getBlob(key: string): Promise<Buffer> {
  const ref = blobDoc(key);
  const meta = await ref.get();
  if (!meta.exists) throw new Error(`Blob not found: ${key}`);
  const snap = await ref.collection("chunks").orderBy("i").get();
  return Buffer.concat(snap.docs.map((d) => Buffer.from((d.data().data as string) ?? "", "base64")));
}

export async function getBlobContentType(key: string): Promise<string | undefined> {
  const meta = await blobDoc(key).get();
  return (meta.data()?.contentType as string | undefined) ?? undefined;
}

export async function blobExists(key: string): Promise<boolean> {
  return (await blobDoc(key).get()).exists;
}

export async function deleteBlob(key: string): Promise<void> {
  const ref = blobDoc(key);
  const chunks = await ref.collection("chunks").listDocuments();
  await mapWithConcurrency(chunks, 10, (d) => d.delete());
  await ref.delete().catch(() => {});
}
