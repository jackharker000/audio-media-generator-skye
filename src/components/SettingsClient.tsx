"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Settings {
  email: string | null;
  displayName: string | null;
  defaultGenre: string | null;
  defaultVoiceGender: "female" | "male" | "neutral" | null;
}

const GENRES = ["pop", "hip-hop", "rock", "lo-fi", "edm", "ballad", "folk", "r&b", "country"];

export function SettingsClient({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [defaultGenre, setDefaultGenre] = useState(initial.defaultGenre ?? "");
  const [defaultVoiceGender, setVoice] = useState(initial.defaultVoiceGender ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, defaultGenre, defaultVoiceGender }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function wipe() {
    if (!confirm("Delete ALL your songs and notebooks? This cannot be undone.")) return;
    setBusy(true);
    try {
      await fetch("/api/settings/content", { method: "DELETE" });
      router.push("/projects");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input bg-slate-50" value={initial.email ?? ""} disabled readOnly />
        </div>
        <div>
          <label className="label">Display name</label>
          <input
            className="input"
            value={displayName}
            placeholder="How friends see you"
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Default genre</label>
            <select className="input" value={defaultGenre} onChange={(e) => setDefaultGenre(e.target.value)}>
              <option value="">No preference</option>
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Default voice</label>
            <select
              className="input"
              value={defaultVoiceGender}
              onChange={(e) => setVoice(e.target.value as "female" | "male" | "neutral" | "")}
            >
              <option value="">No preference</option>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="neutral">neutral</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={busy} onClick={save}>
            Save
          </button>
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-slate-400">
          Defaults pre-fill the generator when you start a new song.
        </p>
      </div>

      <div className="card border-red-200">
        <h2 className="font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-600">
          Permanently delete all of your songs and notebooks. Your account stays, but the content
          can&apos;t be recovered.
        </p>
        <button className="btn-ghost mt-3 text-red-600" disabled={busy} onClick={wipe}>
          Delete all my data
        </button>
      </div>
    </div>
  );
}
