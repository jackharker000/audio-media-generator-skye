# Security Policy

This document describes the security posture of **MnemoSong**, a Next.js 15
(App Router) application deployed on Vercel.

## Reporting a vulnerability

If you discover a security issue, please report it privately rather than opening
a public issue. Email the maintainer with a description, reproduction steps, and
any relevant logs. We aim to acknowledge reports promptly and will coordinate a
fix and disclosure timeline with you.

## HTTP security headers

Baseline security headers are applied to **all routes** via `next.config.mjs`
(`async headers()`):

| Header | Value | Purpose |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage to other origins. |
| `X-Frame-Options` | `SAMEORIGIN` | Mitigate clickjacking via framing. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS for two years, incl. subdomains. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable powerful APIs the app does not use. |

We intentionally do **not** ship a strict `Content-Security-Policy`. Next.js and
Vercel rely on inline bootstrap scripts for hydration; a strict CSP without a
per-request nonce pipeline would break the app. This is a deliberate trade-off;
introducing a nonce-based CSP is a possible future hardening step.

## Rate limiting

`middleware.ts` applies a lightweight, edge-safe sliding-window rate limiter to
the API surface (`matcher: ["/api/:path*"]`):

- **Limit:** 60 requests/minute per client IP (from `x-forwarded-for`, falling
  back to `x-real-ip`).
- **Response when exceeded:** HTTP `429` with a JSON body and `Retry-After` /
  `RateLimit-*` headers.
- **Exemptions:** Auth flows (`/api/auth/*`), the long-lived SSE job stream
  (`/api/jobs/:id/stream`), webhook endpoints, and (future) `/api/inngest`.

The limiter logic lives in `src/lib/ratelimit.ts` as a pure, unit-tested module
(`tests/ratelimit.test.ts`). The store is an in-memory `Map` scoped to a single
edge isolate, so the limit is **best-effort per instance**, not globally
coordinated. It is a zero-cost first line of defense against naive bursts; for
hard global quotas, back it with a shared store (e.g. KV/Redis).

## Authentication & authorization

- Authentication is handled by **Auth.js (next-auth v5)** with the Firebase
  adapter. Sessions are validated server-side.
- API routes that touch user data require an authenticated user and scope all
  reads/writes to that user's ID, enforcing per-user **data ownership**.
- Private app areas (`/projects`, `/songs`, `/library`, `/friends`, `/admin`)
  and the API are disallowed for crawlers via `app/robots.ts`; only public
  routes (`/`, `/signin`) appear in `app/sitemap.ts`.

## Secrets handling

- All secrets (Google service-account credentials, Gemini API keys, Auth.js
  secrets) are provided via **environment variables** and are never committed.
  `.env.example` documents the required/optional variables without values.
- Environment access is centralized in `src/lib/env.ts`. Nothing throws at
  import time, so the app builds and runs with only a subset of services
  configured; feature flags (`hasDb`, `hasGemini`, `hasTts`, `hasCloudStorage`,
  `hasFirebase`) are derived from credential presence.
- Server-only packages (`firebase-admin`, Google Cloud SDKs, ffmpeg, etc.) are
  marked `serverExternalPackages` and only run in Node-runtime routes, never on
  the client.
- The `/api/health` endpoint reports **whether** an integration is configured
  (booleans only) and never exposes secret values.

## Data ownership & privacy

- User content (uploaded study material, generated songs) is owned by the
  authenticated user who created it and is only accessible to that user (or via
  explicit share links the user generates).
- Crawlers are kept out of authenticated areas (see `robots.ts`).

## AI-generated content disclaimer

MnemoSong uses generative AI (Google Gemini and text-to-speech) to write and
sing songs from user material. **AI output can be inaccurate.** The app surfaces
a disclaimer in the UI footer, and users should verify important facts against
their original sources. Generated songs are aids for memorization, not
authoritative references.
