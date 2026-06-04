import Link from "next/link";

const steps = [
  { t: "Add your material", d: "Upload PDFs, Word docs, or paste notes." },
  { t: "We find the key facts", d: "Gemini extracts and ranks what matters, then fact-checks every line." },
  { t: "It becomes a song", d: "A catchy, sung hook drills the most important facts into memory." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Turn anything you need to memorize into a song you can&apos;t forget.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Like NotebookLM, but instead of a podcast it writes and sings a catchy, fact-checked song
          from your own notes. Built to run on free and low-cost AI.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/projects" className="btn-primary px-6 py-3 text-base">
            Make a song →
          </Link>
          <Link href="/library" className="btn-ghost px-6 py-3 text-base">
            My library
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={i} className="card">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
              {i + 1}
            </div>
            <h3 className="font-semibold">{s.t}</h3>
            <p className="mt-1 text-sm text-slate-600">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-4xl">
        <h2 className="mb-4 text-center text-xl font-semibold">More than a song</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { e: "🎤", t: "Karaoke lyrics", d: "Follow along with synced, highlighting lyrics as it plays." },
            { e: "🧠", t: "Quiz yourself", d: "Auto-generated multiple-choice questions test what you've learned." },
            { e: "✅", t: "Fact-checked", d: "Every lyric is checked against your sources — no made-up facts." },
            { e: "👥", t: "Share with friends", d: "Send songs to friends, or keep them private. Your call." },
          ].map((f) => (
            <div key={f.t} className="card flex gap-3">
              <span className="text-2xl">{f.e}</span>
              <div>
                <h3 className="font-semibold">{f.t}</h3>
                <p className="mt-0.5 text-sm text-slate-600">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mx-auto max-w-3xl bg-brand-50">
        <h2 className="text-lg font-semibold">Why a song?</h2>
        <p className="mt-2 text-sm text-slate-700">
          Melody, rhyme, and repetition are some of the oldest and most powerful memory aids we have.
          MnemoSong puts your most important facts in a repeating chorus, checks every lyric against
          your source so nothing is made up, and gives you something you&apos;ll actually replay.
        </p>
      </section>
    </div>
  );
}
