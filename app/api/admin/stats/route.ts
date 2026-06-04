import { ok, guard } from "@/server/http";
import { adminStats } from "@/server/admin";

export const runtime = "nodejs";

export async function GET() {
  return guard(async () => ok(await adminStats()));
}
