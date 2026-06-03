"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressTracker } from "./ProgressTracker";

export interface SongView {
  id: string;
  title: string;
  description?: string | null;
  lyrics: string;
  genre?: string;
  isPublic?: boolean;
  version?: number;
}

const GENRES = ["pop", "hip-hop", "rock", "lo-fi", "edm", "ballad", "folk", "r&b", "country"];

function Lyrics({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7">
      {text.split("\n").map((line, i) => {
        const tag = line.trim().match(/^\[([^\]]+)\]$/);
        if (tag) {
          return (
            <div key={i} className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
              {tag[1]}
            </div>
          );
        }
        return <div key={i}>{line || " "}</div>;
      })}
    </div>
  );
}

export function SongPlayer({ song, canEdit }: { song: SongView; canEdit: boolean }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [genre, setGenre] = useState(song.genre ?? "pop");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    const { jobId } = await post(`/api/songs/${song.id}/regenerate`, { genre });
    setJobId(jobId);
  }
  async function saveEdit() {
    const { jobId } = await post(`/api/songs/${song.id}/edit`, { lyrics, genre });
    setEditing(false);
    setJobId(jobId);
  }
  async function share() {
    const { url } = await post(`/api/songs/${song.id}/share`, { visibility: "public" });
    setShareUrl(url);
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  if (jobId) {
    return (
      <ProgressTracker
        jobId={jobId}
        onComplete={(newSongId) => router.push(`/songs/${newSongId}`)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{song.title}</h1>
            {song.description && <p className="mt-1 text-sm text-slate-600">{song.description}</p>}
            {song.version && song.version > 1 && (
              <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                v{song.version}
              </span>
            )}
          </div>
        </div>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls className="mt-4 w-full" src={`/api/songs/${song.id}/audio`} />

        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn-ghost" href={`/api/songs/${song.id}/audio?download=1`}>
            ⬇ Download
          </a>
          {canEdit && (
            <>
              <button className="btn-ghost" disabled={busy} onClick={share}>
                🔗 Share
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => setEditing((v) => !v)}>
                ✎ Edit lyrics
              </button>
            </>
          )}
        </div>

        {shareUrl && (
          <p className="mt-3 break-all rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Public link (copied): <a className="underline" href={shareUrl}>{shareUrl}</a>
          </p>
        )}
      </div>

      {canEdit && (
        <div className="card">
          <div className="mb-3 flex items-center gap-3">
            <h3 className="font-semibold">Remix</h3>
            <select className="input max-w-[10rem]" value={genre} onChange={(e) => setGenre(e.target.value)}>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button className="btn-primary" disabled={busy} onClick={regenerate}>
              ↻ Regenerate ({genre})
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Regenerate reuses the extracted facts and just re-sings them — fast and cheap.
          </p>
        </div>
      )}

      {editing ? (
        <div className="card">
          <label className="label">Edit the lyrics, then re-sing</label>
          <textarea
            className="input min-h-[16rem] font-mono text-sm"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={saveEdit}>
              Save &amp; re-sing
            </button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3 className="mb-2 font-semibold">Lyrics</h3>
          <Lyrics text={song.lyrics} />
        </div>
      )}
    </div>
  );
}
