import { requireUser, ok, guard } from "@/server/http";
import { deleteMyContent } from "@/server/service";

export const runtime = "nodejs";

/** Self-serve deletion of all the caller's songs/notebooks. */
export async function DELETE() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return guard(async () => {
    await deleteMyContent(u.userId);
    return ok({ ok: true });
  });
}
