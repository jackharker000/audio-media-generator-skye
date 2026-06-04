"use client";

import { useState } from "react";

interface Q {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

/** Active-recall quiz generated from the song's source facts (cached server-side). */
export function Quiz({ songId }: { songId: string }) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/quiz`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't build a quiz");
      setQuestions(data.questions);
      setPicked({});
      setSubmitted(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!questions) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-slate-600">
          Test yourself with multiple-choice questions built from this song&apos;s facts.
        </p>
        <button className="btn-primary" disabled={loading} onClick={load}>
          {loading ? "Building quiz…" : "Start quiz"}
        </button>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  const score = questions.reduce((s, q, i) => s + (picked[i] === q.answerIndex ? 1 : 0), 0);

  return (
    <div className="space-y-5">
      {submitted && (
        <div className="rounded-lg bg-brand-50 p-3 text-center font-semibold text-brand-700">
          You scored {score} / {questions.length}
        </div>
      )}
      {questions.map((q, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-4">
          <p className="font-medium">
            {i + 1}. {q.question}
          </p>
          <div className="mt-2 space-y-1.5">
            {q.options.map((opt, oi) => {
              const isPicked = picked[i] === oi;
              const isCorrect = oi === q.answerIndex;
              let cls = "border-slate-200 hover:bg-slate-50";
              if (submitted && isCorrect) cls = "border-green-400 bg-green-50";
              else if (submitted && isPicked && !isCorrect) cls = "border-red-400 bg-red-50";
              else if (isPicked) cls = "border-brand-400 bg-brand-50";
              return (
                <button
                  key={oi}
                  disabled={submitted}
                  onClick={() => setPicked((p) => ({ ...p, [i]: oi }))}
                  className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {submitted && q.explanation && (
            <p className="mt-2 text-xs text-slate-500">{q.explanation}</p>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        {!submitted ? (
          <button
            className="btn-primary"
            disabled={Object.keys(picked).length < questions.length}
            onClick={() => setSubmitted(true)}
          >
            Submit answers
          </button>
        ) : (
          <button className="btn-ghost" onClick={load}>
            New quiz
          </button>
        )}
      </div>
    </div>
  );
}
