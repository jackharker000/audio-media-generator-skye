export function SetupNotice() {
  return (
    <div className="card mx-auto max-w-xl bg-amber-50">
      <h2 className="text-lg font-semibold text-amber-800">Almost there — finish setup</h2>
      <p className="mt-2 text-sm text-amber-700">
        This feature needs Firebase. Set <code>FIREBASE_SERVICE_ACCOUNT_JSON</code> (the full
        service-account JSON for your Firebase project) in your environment so the app can reach
        Firestore. To generate songs you&apos;ll also want a Gemini key — any variable whose name
        contains <code>API_KEY</code> (e.g. <code>GEMINI_API_KEY</code>) is picked up and rotated
        automatically.
      </p>
      <p className="mt-2 text-xs text-amber-600">
        See <code>.env.example</code> for the full list.
      </p>
    </div>
  );
}
