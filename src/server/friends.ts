import { COLLECTIONS, getDb } from "@/db";
import type { DbFriendship, DbSong, DbUser, SongVisibility } from "@/db/types";

/**
 * Friends / social: friend requests, accepted friendships, the shared-song feed,
 * and visibility-based access checks.
 *
 * Firestore note: we deliberately keep every query to a single `where(...)`
 * filter and merge/sort in JS, so no composite indexes are required.
 */

const col = (name: string) => getDb().collection(name);
const byNewest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;
const withId = <T>(d: { id: string; data: () => any }): T => ({ id: d.id, ...d.data() }) as T;

/** Trimmed-down user info safe to hand to clients. */
export interface FriendUser {
  id: string;
  email: string | null;
  name: string | null;
}

function toFriendUser(u: DbUser | null): FriendUser | null {
  if (!u) return null;
  return { id: u.id, email: u.email ?? null, name: u.name ?? null };
}

async function getUser(userId: string): Promise<DbUser | null> {
  const snap = await col("users").doc(userId).get();
  return snap.exists ? withId<DbUser>(snap) : null;
}

async function findUserByEmail(email: string): Promise<DbUser | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  // Match case-insensitively: try the normalized form, then the exact input
  // (OAuth-stored emails may not be lowercased).
  for (const v of Array.from(new Set([trimmed.toLowerCase(), trimmed]))) {
    const snap = await col("users").where("email", "==", v).limit(1).get();
    if (!snap.empty) return withId<DbUser>(snap.docs[0]);
  }
  return null;
}

/** All friendship docs (any status) that involve this user. */
async function friendshipsInvolving(userId: string): Promise<DbFriendship[]> {
  const [asReq, asAddr] = await Promise.all([
    col(COLLECTIONS.friendships).where("requesterId", "==", userId).get(),
    col(COLLECTIONS.friendships).where("addresseeId", "==", userId).get(),
  ]);
  const map = new Map<string, DbFriendship>();
  for (const d of [...asReq.docs, ...asAddr.docs]) {
    map.set(d.id, withId<DbFriendship>(d));
  }
  return [...map.values()];
}

/** The other party of a friendship, relative to `userId`. */
function otherId(f: DbFriendship, userId: string): string {
  return f.requesterId === userId ? f.addresseeId : f.requesterId;
}

// ---- Requests -------------------------------------------------------------

export async function sendRequest(fromId: string, toEmail: string): Promise<{ created: boolean }> {
  const found = await findUserByEmail(toEmail);
  if (found && found.id === fromId) throw new Error("You can't add yourself.");
  // Do not reveal whether the email maps to an account, or the relationship
  // state — return neutrally to prevent account enumeration.
  if (!found) return { created: false };
  const existing = await friendshipsInvolving(fromId);
  if (existing.some((f) => otherId(f, fromId) === found.id)) return { created: false };

  const now = Date.now();
  await col(COLLECTIONS.friendships).add({
    requesterId: fromId,
    addresseeId: found.id,
    status: "pending" as const,
    createdAt: now,
    updatedAt: now,
  });
  return { created: true };
}

export async function respondRequest(
  userId: string,
  friendshipId: string,
  accept: boolean,
): Promise<void> {
  const snap = await col(COLLECTIONS.friendships).doc(friendshipId).get();
  const f = snap.exists ? withId<DbFriendship>(snap) : null;
  if (!f) throw new Error("Request not found.");
  if (f.addresseeId !== userId) throw new Error("Not allowed.");
  if (f.status !== "pending") throw new Error("Request already handled.");

  if (accept) {
    await col(COLLECTIONS.friendships)
      .doc(friendshipId)
      .update({ status: "accepted", updatedAt: Date.now() });
  } else {
    await col(COLLECTIONS.friendships).doc(friendshipId).delete();
  }
}

export async function removeFriend(userId: string, otherUserId: string): Promise<void> {
  const involving = await friendshipsInvolving(userId);
  const targets = involving.filter(
    (f) => f.status === "accepted" && otherId(f, userId) === otherUserId,
  );
  await Promise.all(
    targets.map((f) => col(COLLECTIONS.friendships).doc(f.id).delete()),
  );
}

// ---- Lists ----------------------------------------------------------------

export async function listFriends(userId: string): Promise<FriendUser[]> {
  const involving = await friendshipsInvolving(userId);
  const accepted = involving.filter((f) => f.status === "accepted");
  const others = await Promise.all(accepted.map((f) => getUser(otherId(f, userId))));
  return others
    .map(toFriendUser)
    .filter((u): u is FriendUser => u !== null)
    .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
}

export interface PendingRequest {
  id: string;
  user: FriendUser;
  createdAt: number;
}

/** Requests sent TO this user awaiting their response. */
export async function listIncoming(userId: string): Promise<PendingRequest[]> {
  const snap = await col(COLLECTIONS.friendships).where("addresseeId", "==", userId).get();
  const pending = snap.docs.map((d) => withId<DbFriendship>(d)).filter((f) => f.status === "pending");
  const out: PendingRequest[] = [];
  for (const f of pending.sort(byNewest)) {
    const user = toFriendUser(await getUser(f.requesterId));
    if (user) out.push({ id: f.id, user, createdAt: f.createdAt });
  }
  return out;
}

/** Requests sent BY this user awaiting the other party's response. */
export async function listOutgoing(userId: string): Promise<PendingRequest[]> {
  const snap = await col(COLLECTIONS.friendships).where("requesterId", "==", userId).get();
  const pending = snap.docs.map((d) => withId<DbFriendship>(d)).filter((f) => f.status === "pending");
  const out: PendingRequest[] = [];
  for (const f of pending.sort(byNewest)) {
    const user = toFriendUser(await getUser(f.addresseeId));
    if (user) out.push({ id: f.id, user, createdAt: f.createdAt });
  }
  return out;
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const involving = await friendshipsInvolving(a);
  return involving.some((f) => f.status === "accepted" && otherId(f, a) === b);
}

// ---- Feed -----------------------------------------------------------------

export interface FeedItem {
  song: DbSong;
  owner: { name: string | null; email: string | null };
}

export async function friendsFeed(userId: string): Promise<FeedItem[]> {
  const friends = await listFriends(userId);
  const items: FeedItem[] = [];
  await Promise.all(
    friends.map(async (friend) => {
      const snap = await col(COLLECTIONS.songs).where("userId", "==", friend.id).get();
      for (const d of snap.docs) {
        const song = withId<DbSong>(d);
        if (song.visibility === "friends" || song.visibility === "public") {
          items.push({ song, owner: { name: friend.name, email: friend.email } });
        }
      }
    }),
  );
  return items.sort((a, b) => byNewest(a.song, b.song));
}

// ---- Access control -------------------------------------------------------

export async function canViewSong(viewerId: string | null, song: DbSong): Promise<boolean> {
  if (viewerId && song.userId === viewerId) return true;
  // Treat both the visibility field and the legacy isPublic flag as "public".
  if (song.visibility === "public" || song.isPublic) return true;
  if (song.visibility === "friends") {
    return viewerId ? areFriends(viewerId, song.userId) : false;
  }
  return false;
}

/** Loads a song and returns it only if the viewer is allowed to see it. */
export async function getViewableSong(
  viewerId: string | null,
  songId: string,
): Promise<DbSong | null> {
  const snap = await col(COLLECTIONS.songs).doc(songId).get();
  if (!snap.exists) return null;
  const song = withId<DbSong>(snap);
  return (await canViewSong(viewerId, song)) ? song : null;
}

// Re-exported for callers that only need the type.
export type { SongVisibility };
