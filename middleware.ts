import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRateLimit,
  clientIpFromHeaders,
  createRateLimitStore,
  isRateLimitExempt,
  pruneRateLimitStore,
} from "@/lib/ratelimit";

/**
 * Lightweight, edge-safe rate limiting for the API surface.
 *
 * The limiter uses an in-memory sliding window (see `@/lib/ratelimit`). It is a
 * best-effort, per-isolate guard rather than a globally coordinated quota, but
 * it costs nothing and blunts naive bursts/abuse. Auth, the SSE job stream, and
 * webhook routes are exempt (see `isRateLimitExempt`).
 */

const LIMIT = 60; // requests
const WINDOW_MS = 60_000; // per minute, per IP

// Module-scoped store survives across requests within a single edge isolate.
const store = createRateLimitStore();

// Occasionally prune to keep memory bounded under churn (every ~200 requests).
let sincePrune = 0;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isRateLimitExempt(pathname)) {
    return NextResponse.next();
  }

  if (++sincePrune >= 200) {
    sincePrune = 0;
    pruneRateLimitStore(store, WINDOW_MS);
  }

  const ip = clientIpFromHeaders(req.headers);
  const result = checkRateLimit(store, ip, { limit: LIMIT, windowMs: WINDOW_MS });

  if (!result.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests. Please slow down and try again shortly.",
        retryAfter: result.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
          "RateLimit-Limit": String(result.limit),
          "RateLimit-Remaining": String(result.remaining),
          "RateLimit-Reset": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const res = NextResponse.next();
  res.headers.set("RateLimit-Limit", String(result.limit));
  res.headers.set("RateLimit-Remaining", String(result.remaining));
  res.headers.set("RateLimit-Reset", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
