import { signIn, authInfo } from "@/auth/auth";

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-center text-2xl font-bold">Sign in to MnemoSong</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Create notebooks and save your songs.
        </p>

        <div className="mt-6 space-y-4">
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
              action={async (formData: FormData) => {
                "use server";
                await signIn("credentials", {
                  email: String(formData.get("email") ?? ""),
                  name: String(formData.get("name") ?? ""),
                  redirectTo: "/projects",
                });
              }}
              className="space-y-3 text-left"
            >
              {authInfo.hasGoogle && (
                <div className="text-center text-xs uppercase tracking-wide text-slate-400">or</div>
              )}
              <div>
                <label className="label">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="input"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Name (optional)</label>
                <input name="name" type="text" placeholder="Your name" className="input" />
              </div>
              <button className="btn-primary w-full py-3">Continue</button>
              <p className="text-center text-xs text-slate-400">
                No password — a lightweight login for testing. Each email gets its own library.
              </p>
            </form>
          )}

          {!authInfo.hasGoogle && !authInfo.devLogin && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              No sign-in method is configured. Set <code>AUTH_GOOGLE_ID</code>/
              <code>AUTH_GOOGLE_SECRET</code>, or run with <code>DEV_LOGIN=1</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
