import { requireUser, ok, fail, guard } from "@/server/http";
import { removeFriend, respondRequest } from "@/server/friends";

export const runtime = "nodejs";

/** id = friendshipId. Body {action:"accept"|"decline"}. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== "accept" && action !== "decline") return fail("Invalid action.");
  return guard(async () => {
    await respondRequest(u.userId, id, action === "accept");
    return ok({ ok: true });
  });
}

/** id = the other user's id; removes the accepted friendship. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  return guard(async () => {
    await removeFriend(u.userId, id);
    return ok({ ok: true });
  });
}
