import { env } from "@/lib/env";

let configured = false;

/** Configure the shared fal client with credentials (idempotent). */
export async function getFal() {
  const { fal } = await import("@fal-ai/client");
  if (!configured) {
    const key = env.falKey();
    if (!key) throw new Error("FAL_KEY is not set — fal-based music providers are unavailable.");
    fal.config({ credentials: key });
    configured = true;
  }
  return fal;
}

/** Normalize fal queue status into our pending/done/error shape. */
export function mapFalStatus(status: string): "pending" | "done" | "error" {
  if (status === "COMPLETED") return "done";
  if (status === "IN_QUEUE" || status === "IN_PROGRESS") return "pending";
  return "error";
}
