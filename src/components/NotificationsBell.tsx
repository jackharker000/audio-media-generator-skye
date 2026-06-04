"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface N {
  id: string;
  type: string;
  message: string;
  songId?: string | null;
  read: boolean;
  createdAt: number;
}

export function NotificationsBell() {
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const d = await res.json();
        setItems(d.items ?? []);
        setUnread(d.unread ?? 0);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await fetch("/api/notifications", { method: "POST" });
      } catch {
        /* ignore */
      }
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">Nothing yet</div>
            ) : (
              items.map((n) => {
                const body = (
                  <div className="px-3 py-2 text-sm hover:bg-slate-50">
                    <div>{n.message}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                );
                return n.songId ? (
                  <Link
                    key={n.id}
                    href={`/friends/songs/${n.songId}`}
                    onClick={() => setOpen(false)}
                    className="block"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })
            )}
          </div>
          <Link
            href="/friends"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2 text-center text-xs text-brand-600 hover:bg-slate-50"
          >
            Manage friends
          </Link>
        </div>
      )}
    </div>
  );
}
