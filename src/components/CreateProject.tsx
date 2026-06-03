"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "Untitled notebook" }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/projects/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex items-end gap-3">
      <div className="flex-1">
        <label className="label">New notebook</label>
        <input
          className="input"
          placeholder="e.g. Biology — Cell Respiration"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </div>
      <button className="btn-primary" disabled={busy} onClick={create}>
        Create
      </button>
    </div>
  );
}
