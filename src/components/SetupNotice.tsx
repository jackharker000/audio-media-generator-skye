export function SetupNotice() {
  return (
    <div className="card mx-auto max-w-xl bg-amber-50">
      <h2 className="text-lg font-semibold text-amber-800">Almost there — finish setup</h2>
      <p className="mt-2 text-sm text-amber-700">
        This feature needs a database. Set <code>DATABASE_URL</code> (a Neon Postgres URL) in your
        environment and run <code>pnpm db:push</code>. To generate songs you&apos;ll also want{" "}
        <code>GEMINI_API_KEY</code>, and either <code>FAL_KEY</code> (sung) or{" "}
        <code>GOOGLE_APPLICATION_CREDENTIALS</code> (free TTS).
      </p>
      <p className="mt-2 text-xs text-amber-600">See <code>.env.example</code> for the full list.</p>
    </div>
  );
}
