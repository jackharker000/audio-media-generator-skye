import { ok, guard } from "@/server/http";
import { deleteUserContent, setUserFlags } from "@/server/admin";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return guard(async () => {
    const body = (await req.json().catch(() => ({}))) as {
      disabled?: boolean;
      quotaOverride?: number | null;
    };
    await setUserFlags(id, {
      disabled: body.disabled,
      quotaOverride: body.quotaOverride,
    });
    return ok({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return guard(async () => {
    await deleteUserContent(id);
    return ok({ ok: true });
  });
}
