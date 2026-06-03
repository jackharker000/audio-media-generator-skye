import { requireUser, ok, guard } from "@/server/http";
import { createProject, listProjects } from "@/server/service";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  return ok(await listProjects(u.userId));
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const body = await req.json().catch(() => ({}));
  return guard(async () =>
    ok(
      await createProject(u.userId, {
        title: String(body.title ?? "Untitled notebook"),
        description: body.description,
        focusPromptDefault: body.focusPromptDefault,
      }),
    ),
  );
}
