import { redirect } from "next/navigation";
import { currentUserId } from "@/auth/auth";

/** For server components: return the user id or redirect to sign-in. */
export async function requireUserPage(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect("/signin");
  return id;
}
