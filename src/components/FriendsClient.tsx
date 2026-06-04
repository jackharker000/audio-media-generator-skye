"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cover } from "./Cover";
import { genreLabel } from "@/shared/constants";

interface FriendUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface PendingRequest {
  id: string;
  user: FriendUser;
  createdAt: number;
}

interface FeedItem {
  id: string;
  title: string;
  genre?: string | null;
  visibility: string | null;
  createdAt: number;
  owner: { name: string | null; email: string | null };
}

function displayName(u: { name: string | null; email: string | null }): string {
  return u.name || u.email || "Someone";
}

export function FriendsClient({
  friends,
  incoming,
  outgoing,
  feed,
}: {
  friends: FriendUser[];
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
  feed: FeedItem[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send request.");
      } else {
        setEmail("");
        setNotice("Request sent.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function respond(id: string, action: "accept" | "decline") {
    setBusy(true);
    try {
      await fetch(`/api/friends/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(otherUserId: string) {
    setBusy(true);
    try {
      await fetch(`/api/friends/${otherUserId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Add a friend */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Add a friend</h2>
        <form onSubmit={send} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <button className="btn-primary" type="submit" disabled={busy || !email.trim()}>
            Send request
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-600">{notice}</p>}
      </section>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Friend requests</h2>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(r.user)}</p>
                  {r.user.email && (
                    <p className="truncate text-xs text-slate-500">{r.user.email}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-primary"
                    disabled={busy}
                    onClick={() => respond(r.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => respond(r.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friends list */}
      <section className="space-y-3">
        <h2 className="font-semibold">Friends</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-slate-500">No friends yet. Add one above.</p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => (
              <li key={f.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(f)}</p>
                  {f.email && <p className="truncate text-xs text-slate-500">{f.email}</p>}
                </div>
                <button className="btn-ghost shrink-0" disabled={busy} onClick={() => remove(f.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Pending sent requests</h2>
          <ul className="space-y-2">
            {outgoing.map((r) => (
              <li key={r.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(r.user)}</p>
                  {r.user.email && (
                    <p className="truncate text-xs text-slate-500">{r.user.email}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-400">pending</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friends' shared songs feed */}
      <section className="space-y-3">
        <h2 className="font-semibold">Friends&apos; songs</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing shared yet. When your friends share songs they&apos;ll show up here.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {feed.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/friends/songs/${item.id}`}
                  className="card flex items-center gap-3 hover:border-brand-300"
                >
                  <Cover seed={item.id} className="h-12 w-12 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{item.title}</h3>
                    <p className="truncate text-sm text-slate-600">
                      by {displayName(item.owner)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.genre ? genreLabel(item.genre) : "Song"} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
