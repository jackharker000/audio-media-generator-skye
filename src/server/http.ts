import { NextResponse } from "next/server";
import { currentUserId, isAdmin } from "@/auth/auth";

export async function requireUser(): Promise<{ userId: string } | NextResponse> {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { userId };
}

/** HTTP-boundary admin gate (defense in depth on top of service assertAdmin). */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a handler so thrown errors become clean JSON 400s (internals never leak). */
export async function guard<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error;
    // Always log the real error server-side for ops/debugging.
    console.error("[api]", err?.stack ?? err?.message ?? e);
    const msg = err?.message ?? "Request failed";
    // Don't surface driver/internal errors to clients; only clean domain messages.
    const internal =
      /fire(store|base)|ECONN|ENOTFOUND|getaddrinfo|certificate|PERMISSION_DENIED|UNAUTHENTICATED|UNAVAILABLE|requires an index|DEADLINE/i.test(
        msg,
      );
    return fail(internal ? "Something went wrong. Please try again." : msg, 400);
  }
}
