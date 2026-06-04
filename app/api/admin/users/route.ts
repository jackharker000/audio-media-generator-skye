import { ok, guard } from "@/server/http";
import { listUsersWithUsage } from "@/server/admin";

export const runtime = "nodejs";

export async function GET() {
  return guard(async () => ok(await listUsersWithUsage()));
}
