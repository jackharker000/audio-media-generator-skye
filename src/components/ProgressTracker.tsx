"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE_LABELS, STAGE_NAMES, type StageName, type StageStates } from "@/shared/types";

export function ProgressTracker({
  jobId,
  onComplete,
}: {
  jobId: string;
  onComplete?: (songId: string) => void;
}) {
  const [states, setStates] = useState<StageStates>({});
  const [status, setStatus] = useState<string>("queued");
  const [error, setError] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.stageStates) setStates(d.stageStates);
        if (d.status) setStatus(d.status);
        if (d.status === "succeeded" && d.songId) {
          onCompleteRef.current?.(d.songId);
          es.close();
        }
        if (d.status === "failed") {
          setError(d.error || "Generation failed");
          es.close();
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);

  const icon = (s?: StageName) => {
    const st = s ? states[s]?.status : undefined;
    if (st === "done") return <span className="text-green-600">✓</span>;
    if (st === "running") return <span className="animate-pulse text-brand-600">●</span>;
    if (st === "error") return <span className="text-red-600">✕</span>;
    return <span className="text-slate-300">○</span>;
  };

  // Collapse the two loop stages into the list once.
  const visible: StageName[] = STAGE_NAMES.filter((s) => s !== "ingest");

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">
          {status === "succeeded"
            ? "Done!"
            : status === "failed"
              ? "Something went wrong"
              : "Composing your song…"}
        </h3>
        {status !== "succeeded" && status !== "failed" && (
          <span className="text-xs text-slate-400">this can take a minute or two</span>
        )}
      </div>

      <ol className="space-y-1.5 text-sm">
        {visible.map((s) => (
          <li
            key={s}
            className={`flex items-center gap-2 ${
              states[s]?.status === "running" ? "font-medium text-slate-900" : "text-slate-600"
            }`}
          >
            {icon(s)} {STAGE_LABELS[s]}
          </li>
        ))}
      </ol>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
