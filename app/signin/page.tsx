import { signIn, authInfo } from "@/auth/auth";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

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
              <button className="btn-ghost w-full py-3 font-semibold">
                <GoogleIcon />
                Sign in with Google
              </button>
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
