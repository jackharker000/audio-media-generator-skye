import Link from "next/link";
import { auth, isAdmin, signOut } from "@/auth/auth";
import { listIncoming } from "@/server/friends";
import { AccountMenu } from "./AccountMenu";
import { NotificationsBell } from "./NotificationsBell";

export async function Nav() {
  const session = await auth().catch(() => null);
  const user = session?.user as
    | { id?: string; email?: string | null; name?: string | null }
    | undefined;
  const admin = user ? await isAdmin().catch(() => false) : false;
  const pendingRequests = user
    ? await listIncoming(user.id ?? "")
        .then((l) => l.length)
        .catch(() => 0)
    : 0;

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const linkClass = "text-slate-600 hover:text-slate-900";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 font-bold text-brand-700">
          <span className="text-xl">🎵</span> MnemoSong
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-4">
          {user ? (
            <>
              <Link href="/projects" className={linkClass}>
                Notebooks
              </Link>
              <Link href="/library" className={linkClass}>
                Library
              </Link>
              <Link href="/friends" className={linkClass}>
                Friends
                {pendingRequests > 0 && (
                  <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {pendingRequests}
                  </span>
                )}
              </Link>
              <NotificationsBell />
              <AccountMenu
                email={user.email}
                name={user.name}
                isAdmin={admin}
                signOutAction={doSignOut}
              />
            </>
          ) : (
            <Link href="/signin" className="btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
