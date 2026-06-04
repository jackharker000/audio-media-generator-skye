import { NextResponse } from "next/server";
import { features } from "@/lib/env";

export const runtime = "nodejs";
// Always reflect live env/feature state; never cache the health payload.
export const dynamic = "force-dynamic";

/**
 * Lightweight liveness/readiness probe. Reports which optional integrations are
 * configured (derived from `@/lib/env` feature flags) without leaking any
 * secrets or values. Returns 200 as long as the process is serving requests.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    features: {
      db: features.hasDb(),
      gemini: features.hasGemini(),
      tts: features.hasTts(),
      storage: features.hasCloudStorage(),
    },
    time: new Date().toISOString(),
  });
}
