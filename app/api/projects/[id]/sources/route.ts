import { requireUser, ok, fail, guard } from "@/server/http";
import { addPasteSource, addUploadSource, deleteSource } from "@/server/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id: projectId } = await ctx.params;
  const contentType = req.headers.get("content-type") ?? "";

  return guard(async () => {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("No file provided");
      if (file.size > MAX_BYTES) return fail("File too large (max 10MB)");
      const buffer = Buffer.from(await file.arrayBuffer());
      const row = await addUploadSource(u.userId, projectId, {
        filename: file.name,
        mime: file.type || undefined,
        buffer,
      });
      return ok(row);
    }
    const body = await req.json().catch(() => ({}));
    if (!body.text || !String(body.text).trim()) return fail("Empty text");
    const row = await addPasteSource(u.userId, projectId, {
      title: body.title,
      text: String(body.text),
    });
    return ok(row);
  });
}

export async function DELETE(req: Request, _ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const sourceId = new URL(req.url).searchParams.get("sourceId");
  if (!sourceId) return fail("Missing sourceId");
  return guard(async () => {
    await deleteSource(u.userId, sourceId);
    return ok({ ok: true });
  });
}
