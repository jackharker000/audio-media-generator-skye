import Link from "next/link";
import { auth, isAdmin, signOut } from "@/auth/auth";
import { listIncoming } from "@/server/friends";

export async function Nav() {
  const session = await auth().catch(() => null);
  const user = session?.user;
  const admin = user ? await isAdmin().catch(() => false) : false;
  const pendingRequests = user
    ? await listIncoming((user as { id?: string }).id ?? "")
        .then((l) => l.length)
        .catch(() => 0)
    : 0;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 font-bold text-brand-700"
        >
          <span className="text-xl">🎵</span> MnemoSong
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-4">
          <Link href="/projects" className="text-slate-600 hover:text-slate-900">
            Notebooks
          </Link>
          <Link href="/library" className="text-slate-600 hover:text-slate-900">
            Library
          </Link>
          {user && (
            <Link href="/friends" className="text-slate-600 hover:text-slate-900">
              Friends
              {pendingRequests > 0 && (
                <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingRequests}
                </span>
              )}
            </Link>
          )}
          {admin && (
            <Link href="/admin" className="text-slate-600 hover:text-slate-900">
              Admin
            </Link>
          )}
          {user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                className="text-slate-500 hover:text-slate-900"
                title={user.email ?? undefined}
              >
                Sign out
                {user.email ? (
                  <span className="hidden md:inline"> ({user.email})</span>
                ) : null}
              </button>
            </form>
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
