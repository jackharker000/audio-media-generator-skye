/** Shared option lists so UI components and validation can't drift. */
export const GENRES = [
  "pop",
  "hip-hop",
  "rock",
  "lo-fi",
  "edm",
  "ballad",
  "folk",
  "r&b",
  "country",
  "jazz",
] as const;

export const VOICE_GENDERS = ["female", "male", "neutral"] as const;
export const VOICE_STYLES = ["sung", "rap", "spoken"] as const;

export type Genre = (typeof GENRES)[number];
export type VoiceGender = (typeof VOICE_GENDERS)[number];

/** Title-case a genre for display ("hip-hop" -> "Hip-Hop", "r&b" -> "R&B"). */
export function genreLabel(g: string): string {
  return g.replace(/(^|[\s-])([a-z])/g, (_m, sep, c) => sep + c.toUpperCase()).replace(/r&b/i, "R&B");
}
