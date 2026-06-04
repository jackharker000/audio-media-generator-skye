"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Compact account dropdown (avatar → menu). Keeps the top bar uncluttered.
 * `signOutAction` is a server action passed down from the (server) Nav.
 */
export function AccountMenu({
  email,
  name,
  isAdmin,
  signOutAction,
}: {
  email?: string | null;
  name?: string | null;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const label = name || email || "Account";
  const initial = (label.trim()[0] || "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={label}
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {email && <div className="truncate px-3 py-2 text-xs text-slate-400">{email}</div>}
          <Link
            href="/settings"
            role="menuitem"
            className="block px-3 py-2 text-sm hover:bg-slate-50"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="block px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Admin
            </Link>
          )}
          <form action={signOutAction}>
            <button
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
