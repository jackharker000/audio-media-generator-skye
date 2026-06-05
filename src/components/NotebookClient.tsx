"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgressTracker } from "./ProgressTracker";
import { GENRES, genreLabel } from "@/shared/constants";

interface SourceView {
  id: string;
  filename: string;
  kind: string;
  status: string;
}
interface SongRef {
  id: string;
  title: string;
  createdAt: string;
}

export function NotebookClient({
  projectId,
  initialSources,
  songs,
  defaultFocus,
  activeJobId,
  defaultGenre,
  defaultVoiceGender,
}: {
  projectId: string;
  initialSources: SourceView[];
  songs: SongRef[];
  defaultFocus?: string;
  activeJobId?: string | null;
  defaultGenre?: string;
  defaultVoiceGender?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<SourceView[]>(initialSources);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reconnect to an in-progress job (e.g. after closing & reopening the page).
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null);

  // Generation options
  const [focus, setFocus] = useState(defaultFocus ?? "");
  const [genre, setGenre] = useState(defaultGenre || "pop");
  const [voiceGender, setVoiceGender] = useState(defaultVoiceGender || "female");
  const [duration, setDuration] = useState(75);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/sources`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSources((s) => [...s, data]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addPaste() {
    if (!paste.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paste }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      setSources((s) => [...s, data]);
      setPaste("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(id: string) {
    await fetch(`/api/projects/${projectId}/sources?sourceId=${id}`, { method: "DELETE" });
    setSources((s) => s.filter((x) => x.id !== id));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          focusPrompt: focus || undefined,
          genre,
          voiceGender,
          targetDurationSec: duration,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start generation");
      setJobId(data.jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sources */}
      <div className="space-y-4">
        <div className="card">
          <h2 className="mb-3 font-semibold">Sources</h2>
          {sources.length === 0 && (
            <p className="text-sm text-slate-500">Add a file or paste notes to get started.</p>
          )}
          <ul className="space-y-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="truncate">
                  {s.kind === "upload" ? "📄" : "📝"} {s.filename}
                </span>
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeSource(s.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-3">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,text/plain"
                className="block w-full text-sm"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
              />
            </div>
            <div>
              <textarea
                className="input min-h-[6rem]"
                placeholder="…or paste your notes here"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button className="btn-ghost mt-2" disabled={busy || !paste.trim()} onClick={addPaste}>
                Add notes
              </button>
            </div>
          </div>
        </div>

        {songs.length > 0 && (
          <div className="card">
            <h2 className="mb-3 font-semibold">Songs in this notebook</h2>
            <ul className="space-y-1 text-sm">
              {songs.map((s) => (
                <li key={s.id}>
                  <Link className="text-brand-700 hover:underline" href={`/songs/${s.id}`}>
                    🎵 {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Generate */}
      <div className="space-y-4">
        {jobId ? (
          <ProgressTracker jobId={jobId} onComplete={(songId) => router.push(`/songs/${songId}`)} />
        ) : (
          <div className="card">
            <h2 className="mb-3 font-semibold">Make a song</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Focus / instructions (optional)</label>
                <textarea
                  className="input"
                  placeholder='e.g. "focus on the Krebs cycle, make it upbeat"'
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Genre</label>
                  <select className="input" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    {GENRES.map((g) => (
                      <option key={g} value={g}>
                        {genreLabel(g)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Voice</label>
                  <select
                    className="input"
                    value={voiceGender}
                    onChange={(e) => setVoiceGender(e.target.value)}
                  >
                    <option value="female">female</option>
                    <option value="male">male</option>
                    <option value="neutral">neutral</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Length: {duration}s</label>
                <input
                  type="range"
                  min={45}
                  max={150}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                className="btn-primary w-full py-3"
                disabled={busy || sources.length === 0}
                onClick={generate}
              >
                🎶 Generate song
              </button>
              {sources.length === 0 && (
                <p className="text-center text-xs text-slate-400">Add a source first</p>
              )}
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
