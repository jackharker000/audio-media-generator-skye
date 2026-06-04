import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientIpFromHeaders,
  createRateLimitStore,
  isRateLimitExempt,
  pruneRateLimitStore,
} from "@/lib/ratelimit";

const opts = { limit: 3, windowMs: 1000 };

describe("checkRateLimit", () => {
  it("allows requests up to the limit then blocks", () => {
    const store = createRateLimitStore();
    const now = 1_000_000;
    expect(checkRateLimit(store, "ip", opts, now).allowed).toBe(true);
    expect(checkRateLimit(store, "ip", opts, now).allowed).toBe(true);
    expect(checkRateLimit(store, "ip", opts, now).allowed).toBe(true);
    const blocked = checkRateLimit(store, "ip", opts, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("decrements remaining as requests are made", () => {
    const store = createRateLimitStore();
    const now = 5_000;
    expect(checkRateLimit(store, "k", opts, now).remaining).toBe(2);
    expect(checkRateLimit(store, "k", opts, now).remaining).toBe(1);
    expect(checkRateLimit(store, "k", opts, now).remaining).toBe(0);
  });

  it("isolates buckets per key", () => {
    const store = createRateLimitStore();
    const now = 42;
    checkRateLimit(store, "a", opts, now);
    checkRateLimit(store, "a", opts, now);
    checkRateLimit(store, "a", opts, now);
    // "a" is now at its limit, but "b" is fresh.
    expect(checkRateLimit(store, "a", opts, now).allowed).toBe(false);
    expect(checkRateLimit(store, "b", opts, now).allowed).toBe(true);
  });

  it("slides the window: old requests expire and free up slots", () => {
    const store = createRateLimitStore();
    const t0 = 0;
    checkRateLimit(store, "ip", opts, t0);
    checkRateLimit(store, "ip", opts, t0);
    checkRateLimit(store, "ip", opts, t0);
    expect(checkRateLimit(store, "ip", opts, t0).allowed).toBe(false);

    // After the full window elapses, the bucket is empty again.
    const later = t0 + opts.windowMs + 1;
    const after = checkRateLimit(store, "ip", opts, later);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(opts.limit - 1);
  });

  it("partial slide: only expired entries are dropped", () => {
    const store = createRateLimitStore();
    // Two requests at t=0, one at t=600.
    checkRateLimit(store, "ip", opts, 0);
    checkRateLimit(store, "ip", opts, 0);
    checkRateLimit(store, "ip", opts, 600);
    // At t=1001 the two t=0 entries have expired (window 1000), leaving room.
    const r = checkRateLimit(store, "ip", opts, 1001);
    expect(r.allowed).toBe(true);
  });
});

describe("pruneRateLimitStore", () => {
  it("removes keys whose entries have all expired", () => {
    const store = createRateLimitStore();
    checkRateLimit(store, "stale", opts, 0);
    checkRateLimit(store, "fresh", opts, 900);
    pruneRateLimitStore(store, opts.windowMs, 1500);
    expect(store.has("stale")).toBe(false);
    expect(store.has("fresh")).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.1, 70.41.3.18" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.1");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "198.51.100.7" });
    expect(clientIpFromHeaders(h)).toBe("198.51.100.7");
  });

  it("returns a sentinel when no IP header is present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("isRateLimitExempt", () => {
  it("exempts auth, SSE streams, and webhooks", () => {
    expect(isRateLimitExempt("/api/auth/session")).toBe(true);
    expect(isRateLimitExempt("/api/jobs/abc123/stream")).toBe(true);
    expect(isRateLimitExempt("/api/webhooks/stripe")).toBe(true);
    expect(isRateLimitExempt("/api/webhook")).toBe(true);
  });

  it("does not exempt normal API routes", () => {
    expect(isRateLimitExempt("/api/jobs/abc123")).toBe(false);
    expect(isRateLimitExempt("/api/projects")).toBe(false);
    expect(isRateLimitExempt("/api/health")).toBe(false);
  });
});
