"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SongVisibility } from "@/db/types";

const OPTIONS: { value: SongVisibility; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "friends", label: "Friends" },
  { value: "public", label: "Public" },
];

/** A small select to change who can see a song. Mount on the owner's song page. */
export function VisibilityControl({
  songId,
  visibility,
}: {
  songId: string;
  visibility?: SongVisibility | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SongVisibility>(visibility ?? "private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: SongVisibility) {
    const prev = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update.");
        setValue(prev);
      } else {
        router.refresh();
      }
    } catch {
      setError("Could not update.");
      setValue(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="label" htmlFor={`visibility-${songId}`}>
        Visibility
      </label>
      <select
        id={`visibility-${songId}`}
        className="input w-auto"
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value as SongVisibility)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
