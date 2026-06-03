import { requireUser, ok, guard } from "@/server/http";
import { createShare, deleteShare } from "@/server/service";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const visibility = body.visibility === "public" ? "public" : "unlisted";
  return guard(async () => {
    const slug = await createShare(u.userId, id, visibility);
    return ok({ slug, url: `${env.appUrl()}/s/${slug}` });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  return guard(async () => {
    await deleteShare(u.userId, id);
    return ok({ ok: true });
  });
}
