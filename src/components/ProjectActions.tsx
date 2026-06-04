"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!confirm("Delete this notebook and all its songs? This can't be undone.")) return;
    setBusy(true);
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      router.push("/projects");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-ghost text-red-600" disabled={busy} onClick={del}>
      🗑 Delete notebook
    </button>
  );
}
