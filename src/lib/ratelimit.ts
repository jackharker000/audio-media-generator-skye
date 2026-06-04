/**
 * Edge-safe, in-memory sliding-window rate limiter.
 *
 * This is intentionally dependency-free and pure: it tracks per-key request
 * timestamps in a Map and decides whether a new request is allowed. It is
 * suitable for a single edge isolate (best-effort, per-instance) and is the
 * limiter that backs `middleware.ts`. The logic here is unit-tested in
 * `tests/ratelimit.test.ts`.
 *
 * Note: because Vercel runs many isolates, this is a soft limit per instance,
 * not a globally coordinated one. For hard global limits use a shared store
 * (KV/Redis); for abuse mitigation a per-instance window is a sensible,
 * zero-cost first line of defense.
 */

export interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** The configured maximum for the window. */
  limit: number;
  /** Remaining requests in the current window after counting this one. */
  remaining: number;
  /** Epoch ms when the window for this key is expected to free up a slot. */
  resetAt: number;
  /** Seconds the client should wait before retrying (only when blocked). */
  retryAfterSeconds: number;
}

/**
 * A minimal store of request timestamps keyed by client identifier.
 * Exposed so callers (and tests) can construct an isolated instance.
 */
export type RateLimitStore = Map<string, number[]>;

export function createRateLimitStore(): RateLimitStore {
  return new Map();
}

/**
 * Pure-ish sliding-window check. Mutates the provided store to record the
 * timestamp of an allowed request and prune expired entries. Pass `now` to
 * keep tests deterministic.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const { limit, windowMs } = options;
  const windowStart = now - windowMs;

  const existing = store.get(key);
  // Keep only timestamps still inside the sliding window.
  const recent = existing ? existing.filter((t) => t > windowStart) : [];

  const oldest = recent.length > 0 ? recent[0] : now;
  const resetAt = oldest + windowMs;

  if (recent.length >= limit) {
    // Blocked: persist the pruned list (no new timestamp added).
    store.set(key, recent);
    const retryAfterMs = Math.max(0, resetAt - now);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  recent.push(now);
  store.set(key, recent);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - recent.length),
    resetAt: recent[0] + windowMs,
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort cleanup of empty/expired buckets to bound memory growth. Safe to
 * call periodically; cheap when the store is small.
 */
export function pruneRateLimitStore(
  store: RateLimitStore,
  windowMs: number,
  now: number = Date.now(),
): void {
  const windowStart = now - windowMs;
  for (const [key, timestamps] of store) {
    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length === 0) store.delete(key);
    else store.set(key, recent);
  }
}

/**
 * Extract a best-effort client IP from request headers. Prefers the first hop
 * in `x-forwarded-for`, falling back to `x-real-ip`. Returns a stable sentinel
 * when no IP is available so unidentified clients share a single bucket.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown";
}

/**
 * Decide whether a given `/api/*` pathname should be exempt from rate limiting.
 * We skip auth flows, the SSE job-stream endpoint (long-lived connections), and
 * any webhook endpoints (which carry their own provider signatures).
 */
export function isRateLimitExempt(pathname: string): boolean {
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/inngest")) return true;
  // SSE: /api/jobs/<id>/stream
  if (/^\/api\/jobs\/[^/]+\/stream\/?$/.test(pathname)) return true;
  // Webhooks: /api/webhooks/* or any path segment named "webhook(s)".
  if (/(^|\/)webhooks?(\/|$)/.test(pathname)) return true;
  return false;
}
