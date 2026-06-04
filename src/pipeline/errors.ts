/** Thrown by the pipeline for unrecoverable failures (no retry). */
export class FatalPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalPipelineError";
  }
}

/** Convert a raw error into a short, user-friendly message for the UI. */
export function friendlyError(err: unknown): string {
  const msg = String((err as Error)?.message ?? err);
  const low = msg.toLowerCase();

  if (
    low.includes("resource_exhausted") ||
    low.includes("exceeded your current quota") ||
    low.includes("429") ||
    (low.includes("quota") && low.includes("gemini")) ||
    low.includes("rate limit")
  ) {
    return "The free Google AI quota is temporarily used up (it's shared across everyone using this app). Please wait a minute and try again. The owner can raise this by enabling billing on the Gemini API.";
  }
  if (low.includes("permission_denied") && low.includes("texttospeech")) {
    return "The Cloud Text-to-Speech engine needs billing. Set MUSIC_PROVIDER=gemini-tts (no billing).";
  }
  if (low.includes("bucket does not exist")) {
    return "Audio storage isn't set up. Remove FIREBASE_STORAGE_BUCKET to store audio in Firestore.";
  }
  if (low.includes("could not verify") || low.includes("couldn't verify")) {
    return msg; // already friendly (grounding gate)
  }
  return msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
}
