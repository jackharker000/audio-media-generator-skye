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

/** Wrap a handler so thrown errors become clean JSON 400s. */
export async function guard<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (e) {
    return fail((e as Error).message ?? "Request failed", 400);
  }
}
