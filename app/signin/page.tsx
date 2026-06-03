import { signIn, authInfo } from "@/auth/auth";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="card text-center">
        <h1 className="text-2xl font-bold">Sign in to MnemoSong</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to create notebooks and save your songs.
        </p>

        <div className="mt-6 space-y-3">
          {authInfo.hasGoogle && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/projects" });
              }}
            >
              <button className="btn-primary w-full py-3">Continue with Google</button>
            </form>
          )}

          {authInfo.devLogin && (
            <form
              action={async () => {
                "use server";
                await signIn("dev", { redirectTo: "/projects" });
              }}
            >
              <button className="btn-ghost w-full py-3">
                Continue as Dev user (local testing)
              </button>
            </form>
          )}

          {!authInfo.hasGoogle && !authInfo.devLogin && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              No sign-in method is configured. Set <code>AUTH_GOOGLE_ID</code>/
              <code>AUTH_GOOGLE_SECRET</code> (and <code>DATABASE_URL</code>), or run locally with{" "}
              <code>DEV_LOGIN=1</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
