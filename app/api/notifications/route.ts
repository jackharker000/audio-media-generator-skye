import { requireUser, ok, guard } from "@/server/http";
import { getNotifications, markAllRead } from "@/server/notifications";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return ok(await getNotifications(u.userId));
}

export async function POST() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return guard(async () => {
    await markAllRead(u.userId);
    return ok({ ok: true });
  });
}
