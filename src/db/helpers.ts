import { getDb } from "@/db";

/** Shared Firestore access helpers (deduped across server modules). */
export const col = (name: string) => getDb().collection(name);

export const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

/** Attach the doc id to its data. */
export const withId = <T>(d: { id: string; data: () => any }): T => ({ id: d.id, ...d.data() }) as T;
