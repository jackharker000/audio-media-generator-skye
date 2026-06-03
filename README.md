# 🎵 MnemoSong

**Turn anything you need to memorize into a song you can't forget.**

MnemoSong is a NotebookLM-style web app: upload your study material (PDF / DOCX /
TXT / Markdown) or paste notes, add an optional prompt (e.g. _"focus on the Krebs
cycle, make it upbeat pop"_), and it writes and **sings** a catchy, **fact-checked**
song whose lyrics encode the key facts — with the most important ones drilled into
a repeating chorus.

It's designed to run on **free and low-cost AI**: Google **Gemini** (free tier)
does all the "thinking", and a swappable music engine sings the result for pennies —
or for **$0** via a Google Text-to-Speech fallback.

---

## Why this architecture?

Google's cheap/free tier **can't sing lyrics** (Lyria 2's API is instrumental-only;
Lyria 3 with vocals has no free tier). So we split the work:

- **Gemini (free)** runs a multi-stage agentic pipeline: extract → knowledge-map →
  plan → write lyrics → **critique → rewrite** → an independent **fact-check gate**.
- **A cheap open song model** (ACE-Step via fal.ai, ~1–3¢/song) only does the final
  "sing the lyrics" render. It's behind a `MusicProvider` abstraction so you can swap
  in MiniMax/Sonauto, or fall back to a **$0** Google-TTS-over-a-beat path.

```
upload/paste ─► [Inngest durable pipeline]
  extract(local) → knowledge map (map/reduce, Gemini Flash-Lite/Flash)
  → song plan → lyric draft → critique↔rewrite loop → FACT-CHECK GATE
  → style params → MUSIC (MusicProvider, async webhook) → post-process → finalize
        │ progress (SSE)                       │ audio
        ▼                                       ▼
     Postgres                              R2 / local blob
```

Every lyric line is bound to a source fact, the critique stage checks each line
against its evidence, and a separate grounding gate can **hard-fail** a song whose
claims aren't supported — so it stays a study tool, not a hallucination machine.

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router, TypeScript, React 19), Tailwind |
| Pipeline | **Inngest** durable step functions (`waitForEvent` for async music) |
| LLM | **Google Gemini** free tier (`@google/genai`, 2.5 Flash / Flash-Lite) |
| Music | `MusicProvider`: **ACE-Step** (fal.ai) · MiniMax/Sonauto · **Google TTS** ($0) |
| DB | Postgres (Neon) + **Drizzle ORM** |
| Storage | **Cloudflare R2** (S3 API) — or local filesystem fallback |
| Auth | **Auth.js (NextAuth v5)** + Google OAuth (+ dev login) |

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in the keys you have (see below)
pnpm db:push                      # create tables (needs DATABASE_URL)
pnpm dev                          # http://localhost:3000
# in a second terminal, run the Inngest dev server so the pipeline executes:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

### Minimum to generate a song

| Goal | Required env |
|---|---|
| **Free / local** (spoken over a beat) | `DATABASE_URL`, `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `MUSIC_PROVIDER=google-tts-beat`, `DEV_LOGIN=1` |
| **Sung** (recommended) | the above + `FAL_KEY`, `MUSIC_PROVIDER=fal-acestep` |
| **Full product** | add `R2_*`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_SECRET` |

With no `DATABASE_URL`/`R2_*`, the app still builds and runs; storage falls back to
the local filesystem (`.data/`), and pages show a setup notice until a DB is set.

See [`.env.example`](./.env.example) for every variable.

## Where the API tokens come from

- **`GEMINI_API_KEY`** — https://aistudio.google.com/apikey (free tier).
- **`FAL_KEY`** — https://fal.ai/dashboard/keys (pay-as-you-go; ACE-Step is ~1–3¢/song).
- **`GOOGLE_APPLICATION_CREDENTIALS`** — a Google Cloud service-account JSON with the
  Text-to-Speech API enabled (free tier ~1M chars/month).
- **`DATABASE_URL`** — a Neon Postgres connection string (https://neon.tech).
- **`R2_*`** — Cloudflare R2 bucket + access keys (https://developers.cloudflare.com/r2).
- **`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`** — Google OAuth client (optional; use
  `DEV_LOGIN=1` locally instead).

## Project layout

```
app/                     # Next.js routes (UI pages + /api/* route handlers)
src/agents/              # Gemini client, prompts, Zod schemas (== shared types)
src/pipeline/            # Inngest orchestration + per-stage logic + job store
src/music/               # MusicProvider abstraction + adapters + registry
src/extract/             # PDF/DOCX/text extraction + token-aware chunking
src/storage/             # R2 (S3 API) with local-filesystem fallback
src/db/                  # Drizzle schema + migrations + client
src/server/              # service layer + http/auth helpers shared by routes & pages
src/components/          # React UI (client components)
```

## Notes & limits

- **Gemini free tier** ≈ 25 songs/day per key (Flash's 250 req/day is the binding
  limit). Push bulk work to Flash-Lite or enable cheap paid billing for more.
- **Music providers**: ACE-Step is Apache-2.0 (commercial use OK). Verify the ToS of
  MiniMax/Sonauto for your use. Songs are AI-generated — label them as such.
- **Optional beats**: drop royalty-free loops in `public/beats/<genre>.mp3` (and a
  `default.mp3`) to give the free TTS path a backing track. Keep them license-clear.

> Songs are AI-generated; always verify important facts against your sources.
