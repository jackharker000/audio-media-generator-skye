import { getDb } from "@/db";

/** Shared Firestore access helpers (deduped across server modules). */
export const col = (name: string) => getDb().collection(name);

export const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

/** Attach the doc id to its data. */
export const withId = <T>(d: { id: string; data: () => any }): T => ({ id: d.id, ...d.data() }) as T;

/**
 * Fetch many docs by id in one round trip (Firestore `getAll`), returned as an
 * id→doc map. De-dupes ids and skips missing docs, so callers can resolve a
 * batch of references without an N+1 of per-id `.get()` calls.
 */
export async function getByIds<T>(name: string, ids: string[]): Promise<Map<string, T>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const refs = unique.map((id) => col(name).doc(id));
  const snaps = await getDb().getAll(...refs);
  const out = new Map<string, T>();
  for (const s of snaps) if (s.exists) out.set(s.id, withId<T>(s));
  return out;
}

