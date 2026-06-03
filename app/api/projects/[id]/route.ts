import { requireUser, ok, fail, guard } from "@/server/http";
import { deleteProject, getProjectDetail } from "@/server/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  try {
    return ok(await getProjectDetail(u.userId, id));
  } catch {
    return fail("Project not found", 404);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  return guard(async () => {
    await deleteProject(u.userId, id);
    return ok({ ok: true });
  });
}
