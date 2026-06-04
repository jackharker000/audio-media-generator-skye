import { ok, guard, requireAdmin } from "@/server/http";
import { adminStats } from "@/server/admin";

export const runtime = "nodejs";

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  return guard(async () => ok(await adminStats()));
}
