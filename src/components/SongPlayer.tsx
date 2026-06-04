"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressTracker } from "./ProgressTracker";
import { KaraokeLyrics } from "./KaraokeLyrics";
import { Quiz } from "./Quiz";
import { Cover } from "./Cover";
import { VisibilityControl } from "./VisibilityControl";
import { GENRES, genreLabel } from "@/shared/constants";
import type { SongVisibility } from "@/db/types";

export interface SongView {
  id: string;
  title: string;
  description?: string | null;
  lyrics: string;
  genre?: string;
  isPublic?: boolean;
  visibility?: SongVisibility | null;
  version?: number;
  projectId?: string;
}
interface FactView {
  factId: string;
  claim: string;
  importance: number;
}
interface LineView {
  section: string;
  text: string;
  factIds: string[];
}

type Tab = "play" | "lyrics" | "facts" | "quiz";

export function SongPlayer({
  song,
  facts = [],
  lines = [],
  canEdit,
  audioSrc,
}: {
  song: SongView;
  facts?: FactView[];
  lines?: LineView[];
  canEdit: boolean;
  audioSrc?: string;
}) {
  const router = useRouter();
  const audioUrl = audioSrc ?? `/api/songs/${song.id}/audio`;
  const downloadUrl = `${audioUrl}${audioUrl.includes("?") ? "&" : "?"}download=1`;
  const [tab, setTab] = useState<Tab>("play");
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lyrics, setLyrics] = useState(song.lyrics);
  const [genre, setGenre] = useState(song.genre ?? "pop");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    try {
      const { jobId } = await post(`/api/songs/${song.id}/regenerate`, { genre });
      setJobId(jobId);
    } catch {
      /* error shown */
    }
  }
  async function saveEdit() {
    try {
      const { jobId } = await post(`/api/songs/${song.id}/edit`, { lyrics, genre });
      setEditing(false);
      setJobId(jobId);
    } catch {
      /* error shown */
    }
  }
  async function share() {
    try {
      const { url } = await post(`/api/songs/${song.id}/share`, { visibility: "public" });
      setShareUrl(url);
      navigator.clipboard?.writeText(url).catch(() => {});
    } catch {
      /* error shown */
    }
  }
  async function remove() {
    if (!confirm("Delete this song permanently?")) return;
    setBusy(true);
    try {
      await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
      router.push(song.projectId ? `/projects/${song.projectId}` : "/library");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (jobId) {
    return (
      <ProgressTracker jobId={jobId} onComplete={(newId) => router.push(`/songs/${newId}`)} />
    );
  }

  const claimFor = (id: string) => facts.find((f) => f.factId === id)?.claim;
  const tabs: { id: Tab; label: string }[] = [
    { id: "play", label: "▶ Play" },
    { id: "lyrics", label: "Lyrics" },
    ...(facts.length ? [{ id: "facts" as Tab, label: "Facts" }] : []),
    ...(canEdit ? [{ id: "quiz" as Tab, label: "Quiz" }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center">
        <Cover seed={song.id} title={song.title} className="h-20 w-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{song.title}</h1>
          {song.description && <p className="mt-1 text-sm text-slate-600">{song.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn-ghost" href={downloadUrl}>
              ⬇ Download
            </a>
            {canEdit && (
              <>
                <button className="btn-ghost" disabled={busy} onClick={share}>
                  🔗 Share
                </button>
                <button className="btn-ghost text-red-600" disabled={busy} onClick={remove}>
                  🗑 Delete
                </button>
              </>
            )}
            {song.version && song.version > 1 && (
              <span className="self-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                v{song.version}
              </span>
            )}
          </div>
          {canEdit && (
            <div className="mt-3">
              <VisibilityControl songId={song.id} visibility={song.visibility} />
            </div>
          )}
          {shareUrl && (
            <p className="mt-2 break-all text-xs text-green-700">Public link copied: {shareUrl}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-brand-600 text-brand-700"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {tab === "play" && (
        <div className="card space-y-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            className="w-full"
            src={audioUrl}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              if (el.duration) setProgress(el.currentTime / el.duration);
            }}
          />
          <KaraokeLyrics lyrics={song.lyrics} progress={progress} />
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-500">Make a variation:</span>
              <select className="input max-w-[9rem]" value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {genreLabel(g)}
                  </option>
                ))}
              </select>
              <button className="btn-primary" disabled={busy} onClick={regenerate}>
                ↻ Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "lyrics" && (
        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Lyrics</h3>
            <button
              className="btn-ghost"
              onClick={() => {
                navigator.clipboard?.writeText(song.lyrics);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {editing && canEdit ? (
            <>
              <textarea
                className="input min-h-[18rem] font-mono"
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
            </>
          ) : (
            <>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm leading-7">
                {song.lyrics}
              </pre>
              {canEdit && (
                <button className="btn-ghost mt-3" onClick={() => setEditing(true)}>
                  ✎ Edit lyrics
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tab === "facts" && (
        <div className="card space-y-5">
          <div>
            <h3 className="mb-2 font-semibold">Key facts to remember</h3>
            <ol className="space-y-1.5 text-sm">
              {[...facts]
                .sort((a, b) => b.importance - a.importance)
                .map((f) => (
                  <li key={f.factId} className="flex gap-2">
                    <span className="text-brand-500">{"★".repeat(Math.max(1, Math.min(5, f.importance)))}</span>
                    <span>{f.claim}</span>
                  </li>
                ))}
            </ol>
          </div>
          {lines.some((l) => l.factIds.length) && (
            <div>
              <h3 className="mb-2 font-semibold">Which line teaches what</h3>
              <ul className="space-y-2 text-sm">
                {lines
                  .filter((l) => l.factIds.length)
                  .map((l, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 p-2">
                      <div className="font-medium">“{l.text}”</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {l.factIds.map((id) => claimFor(id)).filter(Boolean).join(" · ")}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "quiz" && canEdit && (
        <div className="card">
          <Quiz songId={song.id} />
        </div>
      )}
    </div>
  );
}
