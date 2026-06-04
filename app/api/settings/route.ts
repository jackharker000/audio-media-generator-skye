import { requireUser, ok, guard } from "@/server/http";
import { getMySettings, updateMySettings } from "@/server/service";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return ok(await getMySettings(u.userId));
}

export async function PATCH(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const body = await req.json().catch(() => ({}));
  return guard(async () => {
    await updateMySettings(u.userId, {
      displayName: body.displayName,
      defaultGenre: body.defaultGenre,
      defaultVoiceGender: body.defaultVoiceGender,
    });
    return ok({ ok: true });
  });
}
