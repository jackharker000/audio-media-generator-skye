"use client";

import { useEffect, useMemo, useRef } from "react";

interface Line {
  text: string;
  isTag: boolean;
}

/**
 * Karaoke-style lyric highlighting. We don't have per-word timestamps, so the
 * active line is estimated from playback `progress` (0..1) weighted by line
 * length — close enough to follow along while studying.
 */
export function KaraokeLyrics({ lyrics, progress }: { lyrics: string; progress: number }) {
  const lines = useMemo<Line[]>(
    () =>
      lyrics
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l) => ({ text: l, isTag: /^\[[^\]]+\]$/.test(l) })),
    [lyrics],
  );

  // Cumulative end-fraction for each content (non-tag) line.
  const ends = useMemo(() => {
    const total = lines.reduce((s, l) => s + (l.isTag ? 0 : Math.max(l.text.length, 1)), 0) || 1;
    let acc = 0;
    return lines.map((l) => {
      acc += l.isTag ? 0 : Math.max(l.text.length, 1);
      return acc / total;
    });
  }, [lines]);

  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].isTag) continue;
    if (progress <= ends[i] + 1e-6) {
      activeIdx = i;
      break;
    }
    activeIdx = i;
  }

  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  return (
    <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-50 p-4 text-center leading-8">
      {lines.map((l, i) =>
        l.isTag ? (
          <div key={i} className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-400">
            {l.text.replace(/[[\]]/g, "")}
          </div>
        ) : (
          <div
            key={i}
            ref={i === activeIdx ? activeRef : undefined}
            className={
              i === activeIdx
                ? "text-lg font-semibold text-brand-700 transition-colors"
                : i < activeIdx
                  ? "text-slate-400 transition-colors"
                  : "text-slate-600 transition-colors"
            }
          >
            {l.text}
          </div>
        ),
      )}
    </div>
  );
}
