import { requireUser, ok, fail, guard } from "@/server/http";
import { listFriends, listIncoming, listOutgoing, sendRequest } from "@/server/friends";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(u.userId),
    listIncoming(u.userId),
    listOutgoing(u.userId),
  ]);
  return ok({ friends, incoming, outgoing });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) return fail("Email is required.");
  return guard(async () => {
    await sendRequest(u.userId, email);
    // Neutral response (don't reveal whether the account exists).
    return ok({ ok: true, message: "If that account exists, a friend request was sent." });
  });
}
