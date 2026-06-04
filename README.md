# 🎵 MnemoSong

**Turn anything you need to memorize into a song you can't forget.**

MnemoSong is a NotebookLM-style web app: upload your study material (PDF / DOCX /
TXT / Markdown) or paste notes, add an optional prompt (e.g. _"focus on the Krebs
cycle, make it upbeat"_), and it writes a catchy, **fact-checked** song whose
lyrics encode the key facts — with the most important ones drilled into a
repeating chorus.

**100% Google free tier.** Every external component is Google/Firebase:

| Need | Service (free tier) |
|---|---|
| Lyrics + all reasoning | **Google Gemini** (`@google/genai`, 2.5 Flash / Flash-Lite) |
| Database | **Cloud Firestore** (Firebase) |
| File + audio storage | **Firestore** by default (no bucket needed); optional Cloud Storage |
| The "music" | **Gemini vocal + pure-JS synth backing** (chords/bass/drums), no billing |
| Sign-in | **Google OAuth** (Auth.js) |
| Hosting | **Vercel** |

> ⚠️ **Spoken, not sung.** Google's free tier can't truly *sing* (Lyria with
> vocals is paid). So MnemoSong has Gemini write the lyrics and **Gemini TTS
> sing them over a pure-JS synth backing (chords, bass, drums) — on the same free AI Studio key, with
> **no Google Cloud billing**. Free and maximally intelligible — great for memorization.

## How it works

A multi-stage agentic pipeline (all Gemini, all free):

```
upload/paste ─► extract (local) ─► knowledge map (map/reduce)
   ─► song plan ─► lyric draft ─► critique ↔ rewrite loop
   ─► INDEPENDENT FACT-CHECK GATE ─► style/arrange ─► vocal + synth music ─► finalize
```

Every lyric line is bound to a source fact; the critique stage checks each line
against its evidence; and a separate grounding gate can **hard-fail** a song
whose claims aren't supported — so it stays a study tool, not a hallucination
machine.

There's **no external job queue**. Because Google TTS is synchronous, the
pipeline runs inside the progress (SSE) request — which is exactly what makes it
deploy cleanly to Vercel functions, with a stale-job re-drive guard for safety.

## Tech stack

Next.js 15 (App Router, TypeScript, React 19) · Tailwind · Auth.js (NextAuth v5)
· `firebase-admin` (Firestore + Storage) · `@google/genai` ·
`@google-cloud/text-to-speech` · ffmpeg (optional beat mixing).

## Quick start (local)

```bash
pnpm install
cp .env.example .env.local        # fill in the keys (see below)
pnpm dev                          # http://localhost:3000  → sign in with "Dev login"
```

Firestore is schemaless — no migrations to run. With `DEV_LOGIN=1` you can sign
in locally without Google OAuth. With no Cloud Storage configured, generated
audio is written to `.data/` and served locally.

### What you need

1. **Gemini API key** — https://aistudio.google.com/apikey → `GEMINI_API_KEY`.
2. **A Firebase project** (free Spark plan):
   - Enable **Firestore**. (Cloud Storage is **optional** — by default audio is
     stored in Firestore, so you don't need a bucket or the Blaze plan.)
   - No Cloud Text-to-Speech needed — the music uses **Gemini TTS** via your
     `GEMINI_API_KEY` (no billing). (Only set `MUSIC_PROVIDER=google-tts-beat` if
     you'd rather use Cloud TTS, which requires a billing-enabled project.)
   - Create a **service account key** (JSON).
   - Put the JSON inline in `FIREBASE_SERVICE_ACCOUNT_JSON` (one line) or point
     `GOOGLE_APPLICATION_CREDENTIALS` at the file. (Set `FIREBASE_STORAGE_BUCKET`
     only if you'd rather use Cloud Storage than Firestore for audio.)
3. (Production) **Google OAuth** client → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`,
   and `AUTH_SECRET` (`npx auth secret`).

See [`.env.example`](./.env.example) for the full list.

## Deploy to Vercel

1. Push this repo and **import it on Vercel** (framework auto-detected as Next.js).
2. Add environment variables (Project → Settings → Environment Variables):
   - `GEMINI_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the **entire** service-account JSON
     as a single value (Vercel handles the newlines).
   - `AUTH_SECRET` (`npx auth secret`)
   - `DEV_LOGIN=1` for a one-click demo login, **or** `AUTH_GOOGLE_ID` +
     `AUTH_GOOGLE_SECRET` for real Google sign-in.
   - That's it — the rest is optional (see below). No `FIREBASE_STORAGE_BUCKET`
     (audio → Firestore), no Cloud TTS, no URL vars.
3. Deploy.

### Hard-coded production URL

The production site URL is **hard-coded** to
`https://audio-media-generator-skye.vercel.app` — see `DEFAULT_SITE_URL` in
[`src/lib/env.ts`](./src/lib/env.ts). It's used for absolute links (share URLs)
and as the Auth.js callback base, so OAuth redirects stay on the stable domain
instead of the per-deploy URL. **You don't need to set `APP_URL` /
`NEXT_PUBLIC_APP_URL` / `AUTH_URL`** (set them only to override). If your domain
changes, edit that one constant.

For Google sign-in, register this exact redirect URI in your OAuth client:
- redirect URI: `https://audio-media-generator-skye.vercel.app/api/auth/callback/google`
- JavaScript origin: `https://audio-media-generator-skye.vercel.app`

Notes for Vercel:
- The pipeline runs inside the `/api/jobs/[id]/stream` function (`maxDuration =
  300`). Very large documents could exceed that; trim sources or split them.
- Music uses **Gemini TTS** (no billing). `FIREBASE_STORAGE_BUCKET` is optional —
  omit it to store audio in Firestore.

## Project layout

```
app/                     # Next.js routes (UI pages + /api/* route handlers)
src/agents/              # Gemini client, prompts, Zod schemas (== shared types)
src/pipeline/            # in-process runner + per-stage logic + refine core + job store
src/music/               # provider abstraction + Google TTS engine + registry
src/extract/             # PDF/DOCX/text extraction + token-aware chunking
src/storage/             # Cloud Storage (Firebase) with local-filesystem fallback
src/db/                  # Firestore client + document types
src/lib/                 # Firebase Admin init, Google credential resolution, env
src/server/              # service layer + http/auth helpers used by routes & pages
src/components/          # React UI (client components)
```

## Notes & limits

- **Gemini free tier** is limited and **shared across all users** (one server key).
  The pipeline runs on `flash-lite` (higher free quota) and makes few calls, and it
  **rotates across multiple keys** if you set `GEMINI_API_KEYS=key1,key2,...` (keys
  from different Google projects each have their own quota). For real volume, enable
  paid billing on the Gemini API.
- **Multi-user:** each Google account — or each email via the lightweight email
  login (`DEV_LOGIN=1`) — gets its own notebooks and library.
- **Resuming:** generation runs while the page is open; progress is checkpointed to
  Firestore, so reopening an in-progress notebook resumes it where it left off.
- **Optional beats**: drop royalty-free loops in `public/beats/<genre>.mp3` (and a
  `default.mp3`) to give the TTS engine a backing track. Keep them license-clear.

> Songs are AI-generated; always verify important facts against your sources.
