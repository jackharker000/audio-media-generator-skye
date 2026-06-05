import { COLLECTIONS, getDb } from "@/db";
import { col } from "@/db/helpers";
import type { DbUser } from "@/db/types";
import { isAdmin } from "@/auth/auth";

/**
 * Admin-only server helpers: aggregate stats, per-user usage, and account
 * management. Every exported function except `assertAdmin` and `getUserLimits`
 * gates on `await assertAdmin()` so a non-admin can never reach the data layer.
 */

/** YYYY-MM-DD in UTC — matches the `windowDate` on usage docs. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function assertAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

async function countCollection(name: string): Promise<number> {
  return (await col(name).count().get()).data().count;
}

export interface AdminStats {
  users: number;
  songs: number;
  projects: number;
  songsToday: number;
  jobsRunning: number;
}

export async function adminStats(): Promise<AdminStats> {
  await assertAdmin();
  const today = todayUtc();
  const [users, songs, projects, jobsRunning, usageSnap] = await Promise.all([
    countCollection("users"),
    countCollection(COLLECTIONS.songs),
    countCollection(COLLECTIONS.projects),
    col(COLLECTIONS.jobs).where("status", "==", "running").count().get().then((s) => s.data().count),
    col(COLLECTIONS.usage).where("windowDate", "==", today).get(),
  ]);
  const songsToday = usageSnap.docs.reduce(
    (sum, d) => sum + ((d.data().songsGenerated as number) ?? 0),
    0,
  );
  return { users, songs, projects, songsToday, jobsRunning };
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  name: string | null;
  disabled: boolean;
  quotaOverride: number | null;
  songsTotal: number;
  songsToday: number;
  createdAt: number | null;
}

export async function listUsersWithUsage(limit = 200): Promise<AdminUserRow[]> {
  await assertAdmin();
  const today = todayUtc();
  const snap = await col("users").limit(limit).get();

  const rows = await Promise.all(
    snap.docs.map(async (doc): Promise<AdminUserRow> => {
      const u = { id: doc.id, ...(doc.data() as Omit<DbUser, "id">) };
      const [songsCount, usageDoc] = await Promise.all([
        col(COLLECTIONS.songs).where("userId", "==", u.id).count().get(),
        col(COLLECTIONS.usage).doc(`${u.id}_${today}`).get(),
      ]);
      return {
        id: u.id,
        email: u.email ?? null,
        name: u.name ?? null,
        disabled: !!u.disabled,
        quotaOverride: u.quotaOverride ?? null,
        songsTotal: songsCount.data().count,
        songsToday: (usageDoc.data()?.songsGenerated as number) ?? 0,
        createdAt: u.createdAt ?? null,
      };
    }),
  );

  // Newest first; fall back to id for a stable order when createdAt is absent
  // (older accounts created before createdAt was stamped).
  return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id));
}

export interface UserFlags {
  disabled?: boolean;
  quotaOverride?: number | null;
}

export async function setUserFlags(userId: string, flags: UserFlags): Promise<void> {
  await assertAdmin();
  const update: Record<string, unknown> = {};
  if (flags.disabled !== undefined) update.disabled = !!flags.disabled;
  if (flags.quotaOverride !== undefined) {
    const n = Number(flags.quotaOverride);
    update.quotaOverride =
      flags.quotaOverride === null || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n));
  }
  if (Object.keys(update).length === 0) return;
  await col("users").doc(userId).update(update);
}

export interface UserLimits {
  disabled: boolean;
  quotaOverride: number | null;
}

/**
 * Read a user's enforcement limits. Intentionally NOT admin-gated so it can be
 * called from the generation path to enforce per-user disable/quota settings.
 */
export async function getUserLimits(userId: string): Promise<UserLimits> {
  const snap = await col("users").doc(userId).get();
  const data = snap.data() as Partial<DbUser> | undefined;
  return {
    disabled: !!data?.disabled,
    quotaOverride: data?.quotaOverride ?? null,
  };
}

/** Commit a list of doc refs in batches (Firestore caps each batch at 500). */
async function deleteRefsInBatches(
  refs: FirebaseFirestore.DocumentReference[],
): Promise<void> {
  const db = getDb();
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Delete all content owned by a user (songs, projects, jobs, sources). Does NOT
 * delete the user account doc itself.
 */
export async function deleteUserContent(userId: string): Promise<void> {
  await assertAdmin();
  const collections = [
    COLLECTIONS.songs,
    COLLECTIONS.projects,
    COLLECTIONS.jobs,
    COLLECTIONS.sources,
  ];
  const snaps = await Promise.all(
    collections.map((name) => col(name).where("userId", "==", userId).get()),
  );
  const refs = snaps.flatMap((snap) => snap.docs.map((d) => d.ref));
  await deleteRefsInBatches(refs);
}
