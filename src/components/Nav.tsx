import Link from "next/link";
import { auth, signOut } from "@/auth/auth";

export async function Nav() {
  const session = await auth().catch(() => null);
  const user = session?.user;

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
