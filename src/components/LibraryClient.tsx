"use client";

import { useState } from "react";
import Link from "next/link";
import { Cover } from "./Cover";
import { genreLabel } from "@/shared/constants";

interface SongCard {
  id: string;
  title: string;
  description?: string | null;
  genre?: string;
  isPublic?: boolean;
  createdAt: number;
}

export function LibraryClient({ songs }: { songs: SongCard[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? songs.filter((s) => `${s.title} ${s.genre ?? ""}`.toLowerCase().includes(needle))
    : songs;

  return (
    <div className="space-y-4">
      <input
        className="input"
        placeholder="Search your songs…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No matching songs.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="card flex items-center gap-3 hover:border-brand-300">
                <Cover seed={s.id} className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{s.title}</h3>
                    {s.isPublic && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        shared
                      </span>
                    )}
                  </div>
                  {s.description && <p className="truncate text-sm text-slate-600">{s.description}</p>}
                  <p className="text-xs text-slate-500">
                    {s.genre ? genreLabel(s.genre) : "Song"} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
