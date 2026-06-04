import { COLLECTIONS, getDb } from "@/db";
import { byNewest, withId } from "@/db/helpers";
import type { DbNotification } from "@/db/types";

/**
 * In-app notifications (activity feed). Kept index-free: every query filters on
 * a single field (userId) and we sort/count in JS.
 */
const col = () => getDb().collection(COLLECTIONS.notifications);

export async function createNotification(
  n: Pick<DbNotification, "userId" | "type" | "message"> &
    Partial<Pick<DbNotification, "actorId" | "actorName" | "songId">>,
): Promise<void> {
  await col().add({
    userId: n.userId,
    type: n.type,
    message: n.message,
    actorId: n.actorId ?? null,
    actorName: n.actorName ?? null,
    songId: n.songId ?? null,
    read: false,
    createdAt: Date.now(),
  });
}

export async function getNotifications(
  userId: string,
  limit = 30,
): Promise<{ items: DbNotification[]; unread: number }> {
  const snap = await col().where("userId", "==", userId).get();
  const all = snap.docs.map((d) => withId<DbNotification>(d)).sort(byNewest);
  return { items: all.slice(0, limit), unread: all.filter((n) => !n.read).length };
}

export async function markAllRead(userId: string): Promise<void> {
  const snap = await col().where("userId", "==", userId).get();
  const unread = snap.docs.filter((d) => !d.data().read);
  for (let i = 0; i < unread.length; i += 400) {
    const batch = getDb().batch();
    unread.slice(i, i + 400).forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }
}
